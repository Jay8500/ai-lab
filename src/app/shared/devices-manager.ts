import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule } from 'lucide-angular';
import { environment } from '../../environments/environment';
import { DialogService } from '../core/dialog.service';
import { DeviceMessage, LabDevice, TestItem } from '../core/models';
import { SupabaseService } from '../core/supabase.service';
import { ToastService } from '../core/toast.service';
import { FormField } from './form-field';
import { Modal } from './modal';

const KINDS: { v: LabDevice['kind']; l: string }[] = [
  { v: 'hematology', l: 'Haematology (CBC)' },
  { v: 'biochemistry', l: 'Biochemistry' },
  { v: 'immunoassay', l: 'Immunoassay / hormones' },
  { v: 'electrolyte', l: 'Electrolytes' },
  { v: 'hba1c', l: 'HbA1c' },
  { v: 'urine', l: 'Urine' },
  { v: 'coagulation', l: 'Coagulation' },
  { v: 'other', l: 'Other' },
];

type Draft = Omit<LabDevice, 'id' | 'created_at' | 'key_hint' | 'last_message_at'> & { id?: string };

/** Analyzer settings for one lab: connection, code mapping, device key, test messages and the message log. */
@Component({
  selector: 'app-devices-manager',
  imports: [FormsModule, LucideAngularModule, DatePipe, Modal, FormField],
  template: `
    <div class="grid gap-5 xl:grid-cols-[1fr_360px]">
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div><h2 class="section-title">Analyzers</h2><p class="text-xs text-slate-400">Machines that send results straight into AI-Lab.</p></div>
          <button class="btn-primary py-2!" (click)="edit()"><lucide-icon name="plus" class="size-4" /> Add device</button>
        </div>
        @for (d of devices(); track d.id) {
          <article class="card p-4">
            <div class="flex flex-wrap items-center gap-3">
              <span class="grid size-10 place-items-center rounded-xl" [class]="d.active ? 'bg-sky-50 text-sky-600' : 'bg-slate-100 text-slate-400'"><lucide-icon name="monitor" class="size-5" /></span>
              <div class="min-w-0 flex-1">
                <p class="truncate font-bold text-slate-800">{{ d.name }} @if (!d.active) { <span class="pill ml-1 border-slate-200 bg-slate-50 text-slate-500">Off</span> }</p>
                <p class="truncate text-xs text-slate-400">{{ kindLabel(d.kind) }} · {{ makeModel(d) || 'Make / model not set' }} · {{ d.protocol.toUpperCase() }} over {{ d.connection === 'tcp' ? 'LAN' : d.connection === 'file' ? 'file' : 'serial' }}</p>
              </div>
              <span class="text-xs" [class]="d.last_message_at ? 'text-emerald-600' : 'text-slate-400'">
                {{ d.last_message_at ? 'Last message ' + (d.last_message_at | date: 'MMM d, h:mm a') : 'No messages yet' }}
              </span>
              <button class="btn-ghost py-1.5! text-xs" (click)="edit(d)"><lucide-icon name="pencil" class="size-3.5" /> Settings</button>
              <button class="btn-ghost py-1.5! text-xs" (click)="openTest(d)" [disabled]="!d.active"><lucide-icon name="send" class="size-3.5" /> Send test message</button>
            </div>
            <div class="mt-3 flex flex-wrap gap-1.5">
              @for (m of d.mapping.slice(0, 14); track m.device_code) {
                <span class="rounded-lg bg-slate-50 px-2 py-1 font-mono text-[10px] text-slate-500 ring-1 ring-slate-100">{{ m.device_code }} → {{ m.test_code }}.{{ m.param_key }}</span>
              }
              @if (d.mapping.length > 14) { <span class="text-[11px] text-slate-400">+{{ d.mapping.length - 14 }} more</span> }
              @if (!d.mapping.length) { <span class="text-xs text-amber-600">No codes mapped — results match only when the machine's codes equal your parameter codes.</span> }
            </div>
            <!-- Recent messages -->
            @let msgs = messagesFor(d.id);
            @if (msgs.length) {
              <ul class="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
                @for (m of msgs; track m.id) {
                  <li class="px-3 py-2 text-xs">
                    <button class="flex w-full items-center gap-2 text-left" (click)="toggle(m.id)">
                      <span class="pill" [class]="tone(m.status)">{{ m.status }}</span>
                      @if (m.simulated) { <span class="pill border-violet-100 bg-violet-50 text-violet-600">test</span> }
                      <span class="min-w-0 flex-1 truncate text-slate-600">{{ m.error || ((m.summary?.matched?.length ?? 0) + ' value(s) saved' + (m.summary?.unmatched?.length ? ' · ' + m.summary!.unmatched.length + ' not matched' : '')) }}</span>
                      <span class="text-slate-400">{{ m.received_at | date: 'MMM d, h:mm:ss a' }}</span>
                    </button>
                    @if (expanded() === m.id) {
                      <div class="mt-2 space-y-1">
                        @for (x of m.summary?.matched ?? []; track $index) { <p class="font-mono text-emerald-700">✓ {{ x }}</p> }
                        @for (x of m.summary?.unmatched ?? []; track $index) { <p class="font-mono text-rose-600">✗ {{ x }}</p> }
                        @for (x of m.summary?.skipped ?? []; track $index) { <p class="font-mono text-slate-500">– {{ x }}</p> }
                        @if (m.raw) { <pre class="mt-1 max-h-40 overflow-auto rounded-lg bg-slate-900 p-2 text-[10px] text-slate-200">{{ m.raw }}</pre> }
                      </div>
                    }
                  </li>
                }
              </ul>
            }
          </article>
        } @empty {
          <div class="card p-8 text-center text-sm text-slate-500">
            <lucide-icon name="monitor" class="mx-auto size-8 text-slate-300" />
            <p class="mt-2 font-semibold text-slate-700">No analyzers yet</p>
            <p class="mt-1 text-xs">Results can still be typed in Results. Add a device when a machine is ready to connect.</p>
          </div>
        }
      </div>

      <!-- How to connect -->
      <aside class="card h-fit space-y-3 p-4 text-xs leading-relaxed text-slate-600">
        <h3 class="section-title">How a machine connects</h3>
        <ol class="list-decimal space-y-1.5 pl-4">
          <li>Add the device here, map its test codes and press <b>Generate key</b>.</li>
          <li>On the PC next to the analyzer, install the <b>Spread Apps Lab Connector</b> and paste the device key. It listens on the serial port / LAN port the analyzer uses for "LIS / host".</li>
          <li>Print tube <b>barcode labels</b> from the patient card — the analyzer reads the token from the tube.</li>
          <li>Results arrive in <b>Results</b> as "From analyzer"; a pathologist verifies and the report is created.</li>
        </ol>
        <div class="rounded-xl bg-slate-50 p-3">
          <p class="font-semibold text-slate-700">For the connector / IT team</p>
          <p class="mt-1">POST the analyzer's ASTM or HL7 message (text) to:</p>
          <p class="mt-1 font-mono break-all text-slate-800">{{ endpoint }}</p>
          <p class="mt-1">Header: <span class="font-mono">Authorization: Bearer &lt;device key&gt;</span></p>
          <button class="mt-2 font-semibold text-brand hover:underline" (click)="copy(endpoint)">Copy address</button>
        </div>
        <p class="text-slate-400">Sample ID on the tube must be the visit token (e.g. {{ example() }}). Results never overwrite values a pathologist has verified.</p>
      </aside>
    </div>

    <!-- Device settings -->
    @if (draft(); as d) {
      @let e = errs();
      <app-modal [title]="d.id ? 'Device settings' : 'Add device'" [width]="760" (closed)="draft.set(null)">
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-2">
            <app-field label="Name" required [error]="e.name" hint="e.g. Mindray CBC – front bench"><input class="input" [(ngModel)]="d.name" maxlength="60" /></app-field>
            <app-field label="Type" required>
              <select class="input" [(ngModel)]="d.kind">@for (k of kinds; track k.v) { <option [value]="k.v">{{ k.l }}</option> }</select>
            </app-field>
            <app-field label="Make" optional><input class="input" [(ngModel)]="d.make" placeholder="Mindray / Sysmex / Erba…" maxlength="40" /></app-field>
            <app-field label="Model" optional><input class="input" [(ngModel)]="d.model" placeholder="BC-5000" maxlength="40" /></app-field>
            <app-field label="Protocol" required hint="In the analyzer's LIS / host settings.">
              <select class="input" [(ngModel)]="d.protocol"><option value="astm">ASTM (E1394 / LIS2-A2)</option><option value="hl7">HL7 v2</option></select>
            </app-field>
            <app-field label="Connection" required>
              <select class="input" [(ngModel)]="d.connection"><option value="serial">Serial cable (RS-232 / USB)</option><option value="tcp">Network (LAN / TCP-IP)</option><option value="file">Export file / folder</option></select>
            </app-field>
            @if (d.connection === 'tcp') {
              <app-field label="Analyzer IP / host" optional [error]="e.host"><input class="input font-mono" [(ngModel)]="d.settings.host" placeholder="192.168.1.50" /></app-field>
              <app-field label="Port" required [error]="e.port"><input class="input font-mono" type="number" [(ngModel)]="d.settings.port" placeholder="5000" /></app-field>
            } @else if (d.connection === 'serial') {
              <app-field label="Baud rate" required [error]="e.baud">
                <select class="input" [(ngModel)]="d.settings.baud">@for (b of bauds; track b) { <option [ngValue]="b">{{ b }}</option> }</select>
              </app-field>
              <app-field label="Data / parity / stop" optional hint="Usually 8 / none / 1."><input class="input font-mono" [value]="'8 / none / 1'" disabled /></app-field>
            } @else {
              <app-field label="Folder on the PC" optional class="sm:col-span-2"><input class="input font-mono" [(ngModel)]="d.settings.folder" placeholder="C:\\LIS\\results" /></app-field>
            }
          </div>

          <div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="label mb-0!">Code mapping <span class="font-normal text-slate-400">(machine code → test value)</span></span>
              <span class="flex gap-2">
                <select class="input w-auto py-1.5! text-xs" [ngModel]="''" (ngModelChange)="autoMap($event)">
                  <option value="">Auto-map a test…</option>
                  @for (t of paramTests(); track t.code) { <option [value]="t.code">{{ t.code }} · {{ t.name }}</option> }
                </select>
                <button class="btn-ghost py-1.5! text-xs" (click)="addMap()"><lucide-icon name="plus" class="size-3.5" /> Row</button>
              </span>
            </div>
            <div class="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              @for (m of d.mapping; track $index; let i = $index) {
                <div class="grid grid-cols-[1fr_1fr_1fr_32px] gap-1.5">
                  <input class="input py-1.5! font-mono text-xs uppercase" [class.is-invalid]="!!e.map?.[i]" [(ngModel)]="m.device_code" placeholder="Machine code e.g. HGB" />
                  <select class="input py-1.5! text-xs" [(ngModel)]="m.test_code" (ngModelChange)="m.param_key = ''">
                    <option value="">Test…</option>@for (t of paramTests(); track t.code) { <option [value]="t.code">{{ t.code }}</option> }
                  </select>
                  <select class="input py-1.5! text-xs" [class.is-invalid]="!!e.map?.[i]" [(ngModel)]="m.param_key">
                    <option value="">Value…</option>@for (p of paramsOf(m.test_code); track p.key) { <option [value]="p.key">{{ p.key }} · {{ p.name }}</option> }
                  </select>
                  <button class="grid place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" (click)="d.mapping.splice(i, 1)"><lucide-icon name="x" class="size-3.5" /></button>
                </div>
                @if (e.map?.[i]) { <p class="text-xs text-rose-600">{{ e.map![i] }}</p> }
              } @empty {
                <p class="rounded-xl bg-slate-50 px-3 py-3 text-xs text-slate-500">Pick "Auto-map a test" to map its values, then change machine codes to what the analyzer sends (see its LIS manual).</p>
              }
            </div>
            @if (!paramTests().length) { <p class="mt-2 text-xs text-amber-600">No tests have values yet — add them in Tests (Values) first.</p> }
          </div>

          @if (d.id) {
            <div class="rounded-xl border border-slate-200 p-3">
              <div class="flex flex-wrap items-center gap-2">
                <lucide-icon name="key-round" class="size-4 text-slate-400" />
                <span class="flex-1 text-sm text-slate-700">Device key {{ keyHint() ? '· ends …' + keyHint() : '· not created' }}</span>
                <button class="btn-ghost py-1.5! text-xs" (click)="rotate(d.id!)">{{ keyHint() ? 'Replace key' : 'Generate key' }}</button>
              </div>
              @if (newKey()) {
                <div class="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2">
                  <span class="min-w-0 flex-1 truncate font-mono text-xs text-amber-900">{{ newKey() }}</span>
                  <button class="text-xs font-semibold text-amber-800 hover:underline" (click)="copy(newKey()!)">Copy</button>
                </div>
                <p class="mt-1 text-xs text-amber-700">Shown only once — paste it into the Lab Connector now.</p>
              }
            </div>
          }
          <label class="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" class="size-4 accent-[var(--brand)]" [(ngModel)]="d.active" /> Accept results from this device</label>

          <div class="flex flex-wrap justify-between gap-2">
            @if (d.id) { <button class="btn-ghost text-rose-600! hover:bg-rose-50!" (click)="remove(d.id!)"><lucide-icon name="trash-2" class="size-4" /> Delete</button> } @else { <span></span> }
            <span class="flex gap-2">
              <button class="btn-ghost" (click)="draft.set(null)">Cancel</button>
              <button class="btn-primary" (click)="save()" [disabled]="busy()"><lucide-icon name="save" class="size-4" /> Save</button>
            </span>
          </div>
        </div>
      </app-modal>
    }

    <!-- Test message -->
    @if (testing(); as d) {
      <app-modal title="Send a test message" [subtitle]="d.name + ' · ' + d.protocol.toUpperCase()" [width]="640" (closed)="testing.set(null)">
        <div class="space-y-3">
          <app-field label="Visit token" required hint="A visit of this lab with tests this device handles.">
            <input class="input font-mono uppercase" [(ngModel)]="testToken" (ngModelChange)="buildSample(d)" [placeholder]="example()" />
          </app-field>
          <app-field label="Message" hint="Built from your mapping with sample values — edit it to try other cases.">
            <textarea class="input min-h-40 font-mono text-[11px]" [(ngModel)]="testMessage"></textarea>
          </app-field>
          <div class="flex justify-end gap-2">
            <button class="btn-ghost" (click)="testing.set(null)">Close</button>
            <button class="btn-primary" (click)="sendTest(d)" [disabled]="busy() || !testMessage.trim()">
              <lucide-icon [name]="busy() ? 'loader-circle' : 'send'" class="size-4" [class.animate-spin]="busy()" /> Send
            </button>
          </div>
        </div>
      </app-modal>
    }
  `,
})
export class DevicesManager {
  readonly tenantId = input.required<string>();
  readonly catalog = input<TestItem[]>([]);
  readonly tokenPrefix = input('LAB');

  private readonly sb = inject(SupabaseService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(DialogService);

  protected readonly kinds = KINDS;
  protected readonly bauds = [1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
  protected readonly endpoint = `${environment.supabaseUrl}/functions/v1/device-ingest`;
  protected readonly devices = signal<LabDevice[]>([]);
  protected readonly messages = signal<DeviceMessage[]>([]);
  protected readonly draft = signal<Draft | null>(null);
  protected readonly testing = signal<LabDevice | null>(null);
  protected readonly newKey = signal<string | null>(null);
  protected readonly keyHint = signal<string | null>(null);
  protected readonly expanded = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected testToken = '';
  protected testMessage = '';

  protected readonly paramTests = computed(() => this.catalog().filter((t) => t.params?.length));
  protected readonly example = computed(() => {
    const d = new Date();
    return `${this.tokenPrefix()}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-001`;
  });

  constructor() {
    effect(() => {
      if (this.tenantId()) void this.load();
    });
  }

  async load() {
    const [{ data: devs }, { data: msgs }] = await Promise.all([
      this.sb.client.from('lab_devices').select('*').eq('tenant_id', this.tenantId()).order('created_at'),
      this.sb.client.from('device_messages').select('*').eq('tenant_id', this.tenantId()).order('received_at', { ascending: false }).limit(60),
    ]);
    this.devices.set((devs ?? []) as LabDevice[]);
    this.messages.set((msgs ?? []) as DeviceMessage[]);
  }

  messagesFor(id: string) {
    return this.messages().filter((m) => m.device_id === id).slice(0, 5);
  }
  makeModel(d: LabDevice) {
    return [d.make, d.model].filter(Boolean).join(' ');
  }
  kindLabel(k: string) {
    return KINDS.find((x) => x.v === k)?.l ?? k;
  }
  tone(s: string) {
    return s === 'matched' ? 'border-emerald-100 bg-emerald-50 text-emerald-600' : s === 'partial' ? 'border-amber-100 bg-amber-50 text-amber-600' : 'border-rose-100 bg-rose-50 text-rose-600';
  }
  toggle(id: string) {
    this.expanded.set(this.expanded() === id ? null : id);
  }
  paramsOf(code: string) {
    return this.catalog().find((t) => t.code === code)?.params?.filter((p) => !p.formula) ?? [];
  }

  edit(d?: LabDevice) {
    this.submitted.set(false);
    this.newKey.set(null);
    this.keyHint.set(d?.key_hint ?? null);
    this.draft.set(
      d
        ? structuredClone({ id: d.id, tenant_id: d.tenant_id, name: d.name, kind: d.kind, make: d.make, model: d.model, protocol: d.protocol, connection: d.connection, settings: { ...d.settings }, mapping: d.mapping.map((m) => ({ ...m })), active: d.active })
        : { tenant_id: this.tenantId(), name: '', kind: 'hematology', make: '', model: '', protocol: 'astm', connection: 'serial', settings: { baud: 9600 }, mapping: [], active: true },
    );
  }

  addMap() {
    this.draft.update((d) => (d ? { ...d, mapping: [...d.mapping, { device_code: '', test_code: '', param_key: '' }] } : d));
  }
  autoMap(code: string) {
    if (!code) return;
    const add = this.paramsOf(code).map((p) => ({ device_code: p.key, test_code: code, param_key: p.key }));
    this.draft.update((d) => (d ? { ...d, mapping: [...d.mapping.filter((m) => !add.some((a) => a.device_code === m.device_code.toUpperCase())), ...add] } : d));
  }

  errs(): { name?: string; host?: string; port?: string; baud?: string; map?: Record<number, string> } {
    const d = this.draft();
    if (!this.submitted() || !d) return {};
    const e: { name?: string; host?: string; port?: string; baud?: string; map?: Record<number, string> } = {};
    if ((d.name ?? '').trim().length < 2) e.name = 'Give the device a name.';
    if (d.connection === 'tcp') {
      const port = Number(d.settings.port);
      if (!Number.isInteger(port) || port < 1 || port > 65535) e.port = 'Port: 1 to 65535.';
      if (d.settings.host && !/^[a-z0-9.-]+$/i.test(d.settings.host)) e.host = 'Use an IP address like 192.168.1.50.';
    }
    if (d.connection === 'serial' && !d.settings.baud) e.baud = 'Pick the baud rate set on the analyzer.';
    const seen = new Set<string>();
    d.mapping.forEach((m, i) => {
      const c = (m.device_code ?? '').trim().toUpperCase();
      let msg = '';
      if (!c && !m.test_code) return;
      if (!/^[A-Z0-9_#%.\-^/]{1,24}$/.test(c)) msg = 'Machine code is missing or has spaces.';
      else if (seen.has(c)) msg = `Code ${c} is mapped twice.`;
      else if (!m.test_code || !m.param_key) msg = 'Pick the test and value this code fills.';
      seen.add(c);
      if (msg) (e.map ??= {})[i] = msg;
    });
    return e;
  }

  async save() {
    const d = this.draft();
    if (!d) return;
    this.submitted.set(true);
    if (Object.keys(this.errs()).length) return this.toast.warn('Fix the highlighted settings.');
    this.busy.set(true);
    try {
      const row = {
        tenant_id: d.tenant_id, name: d.name.trim(), kind: d.kind, make: d.make?.trim() || null, model: d.model?.trim() || null,
        protocol: d.protocol, connection: d.connection, active: d.active,
        settings: d.connection === 'tcp' ? { host: d.settings.host?.trim() || undefined, port: Number(d.settings.port) } : d.connection === 'serial' ? { baud: Number(d.settings.baud), data_bits: 8, parity: 'none', stop_bits: 1 } : { folder: d.settings.folder?.trim() || undefined },
        mapping: d.mapping.filter((m) => m.device_code.trim()).map((m) => ({ device_code: m.device_code.trim().toUpperCase(), test_code: m.test_code, param_key: m.param_key })),
      };
      const res = d.id ? await this.sb.client.from('lab_devices').update(row).eq('id', d.id).select().single() : await this.sb.client.from('lab_devices').insert(row).select().single();
      if (res.error) throw res.error;
      await this.load();
      if (!d.id) {
        this.edit(res.data as LabDevice);
        this.toast.success('Device added — generate its key when the connector is ready.');
      } else {
        this.draft.set(null);
        this.toast.success('Device saved.');
      }
    } catch (e) {
      this.toast.fail(e, 'Could not save the device.');
    } finally {
      this.busy.set(false);
    }
  }

  async rotate(id: string) {
    if (this.keyHint() && !(await this.dialog.confirm({ title: 'Replace the device key?', message: 'The connector using the old key stops sending until you paste the new one.', confirmText: 'Replace key', tone: 'warning' }))) return;
    const { data, error } = await this.sb.client.rpc('rotate_device_key', { p_device: id });
    if (error) return this.toast.fail(error, 'Could not create the key.');
    this.newKey.set(data as string);
    this.keyHint.set(String(data).slice(-4));
    await this.load();
  }

  async remove(id: string) {
    if (!(await this.dialog.confirm({ title: 'Delete this device?', message: 'Its settings and message log are removed. Results already saved stay.', confirmText: 'Delete', tone: 'danger' }))) return;
    const { error } = await this.sb.client.from('lab_devices').delete().eq('id', id);
    if (error) return this.toast.fail(error);
    this.draft.set(null);
    await this.load();
    this.toast.success('Device deleted.');
  }

  openTest(d: LabDevice) {
    this.testToken = '';
    this.testMessage = '';
    this.testing.set(d);
    this.buildSample(d);
  }

  /** ASTM / HL7 sample built from the mapping, with values inside each normal range. */
  buildSample(d: LabDevice) {
    const token = (this.testToken || this.example()).toUpperCase().trim();
    const rows = d.mapping.map((m) => {
      const p = this.catalog().find((t) => t.code === m.test_code)?.params?.find((x) => x.key === m.param_key);
      const lo = p?.low ?? null;
      const hi = p?.high ?? null;
      const v = lo != null && hi != null ? lo + (hi - lo) * (0.3 + Math.random() * 0.4) : hi != null ? hi * 0.7 : lo != null ? lo * 1.3 : 1;
      const dec = p?.decimals ?? 1;
      return { code: m.device_code, value: v.toFixed(dec), unit: p?.unit ?? '' };
    });
    const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
    if (d.protocol === 'hl7') {
      this.testMessage = [
        `MSH|^~\\&|${d.make || 'ANALYZER'}|LAB|AILAB|LAB|${ts}||ORU^R01|${ts}|P|2.3.1`,
        `PID|1||${token}`,
        `OBR|1|${token}|${token}`,
        ...rows.map((r, i) => `OBX|${i + 1}|NM|${r.code}^${r.code}||${r.value}|${r.unit}|||||F`),
      ].join('\r\n');
    } else {
      this.testMessage = [
        `H|\\^&|||${d.make || 'ANALYZER'}^${d.model || ''}|||||||P|1|${ts}`,
        `P|1`,
        `O|1|${token}||^^^${d.kind.toUpperCase()}|R`,
        ...rows.map((r, i) => `R|${i + 1}|^^^${r.code}|${r.value}|${r.unit}||N||F||||${ts}`),
        `L|1|N`,
      ].join('\r\n');
    }
  }

  async sendTest(d: LabDevice) {
    this.busy.set(true);
    try {
      const { data, error } = await this.sb.client.functions.invoke('device-ingest', { body: { device_id: d.id, simulate: true, message: this.testMessage } });
      let res = data;
      if (error) {
        try {
          res = await (error as { context?: Response }).context?.json();
        } catch {
          res = { error: error.message };
        }
      }
      await this.load();
      this.expanded.set(this.messagesFor(d.id)[0]?.id ?? null);
      if (res?.error) this.toast.warn(res.error);
      else if (res?.status === 'matched') this.toast.success(`${res.matched.length} value(s) saved to ${this.testToken || 'the visit'} — open Results to verify.`);
      else this.toast.warn(`${res?.matched?.length ?? 0} saved, ${res?.unmatched?.length ?? 0} not matched — see the message log.`);
      if (!res?.error) this.testing.set(null);
    } catch (e) {
      this.toast.fail(e, 'Could not send the test message.');
    } finally {
      this.busy.set(false);
    }
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.toast.success('Copied');
    } catch {
      this.toast.warn('Couldn’t copy — select it manually.');
    }
  }
}
