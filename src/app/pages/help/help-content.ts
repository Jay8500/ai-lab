/**
 * Step-by-step help, one card per page. Keep each step short:
 * `do` is the goal, `flow` the clicks in order (rendered as chips with arrows).
 */
export type HelpAudience = 'platform' | 'root' | 'owner' | 'staff';

export interface HelpStep {
  do: string;
  flow: string[];
}

export interface HelpSection {
  id: string;
  title: string;
  icon: string;
  /** Page this section is about (link button), if any */
  route?: string;
  who: HelpAudience[];
  steps: HelpStep[];
}

const PROFILE_SECURITY = (base: string, who: HelpAudience[]): HelpSection[] => [
  {
    id: 'profile',
    title: 'My profile',
    icon: 'users',
    route: `${base}/profile`,
    who,
    steps: [
      { do: 'Open profile', flow: ['Avatar', 'My profile'] },
      { do: 'Change photo', flow: ['Change photo', 'Pick image', 'Save profile'] },
      { do: 'Change name', flow: ['Full name', 'Save profile'] },
      { do: 'Change password', flow: ['New password', 'Confirm', 'Update password'] },
    ],
  },
  {
    id: 'security',
    title: 'Account security',
    icon: 'shield-check',
    route: `${base}/security`,
    who,
    steps: [
      { do: 'See devices', flow: ['My profile', 'Account security'] },
      { do: 'Remove a device', flow: ['Device', 'Remove', 'Sign out device'] },
      { do: 'Sign out others', flow: ['Sign out all other devices', 'Confirm'] },
      { do: 'New device sign-in', flow: ['Sign in', 'Continue here', 'Others signed out'] },
      { do: 'Google sign-in', flow: ['Login', 'Sign in with Google', 'Same Gmail as your login'] },
      { do: 'One tab only', flow: ['2nd tab opens', 'Already open in another tab', 'Use this tab instead'] },
      { do: 'Sign out here', flow: ['Sidebar', 'Red sign-out'] },
    ],
  },
];

const TASKS = (base: string, who: HelpAudience[]): HelpSection => ({
  id: 'tasks',
  title: 'Tasks',
  icon: 'list-todo',
  route: `${base}/tasks`,
  who,
  steps: [
    { do: 'Quick add', flow: ['Type task', 'Enter', 'Due today'] },
    { do: 'Full task', flow: ['New task', 'Title *', 'Assign to *', 'Due date', 'Priority', 'Create task'] },
    { do: 'Complete', flow: ['Tick ○', 'Done'] },
    { do: 'Edit / delete', flow: ['Click task', 'Change', 'Save changes'] },
    { do: 'Filter', flow: ['My tasks', 'Assigned by me', 'All', 'Open / Done'] },
  ],
});

export const HELP: HelpSection[] = [
  // ───────────── SpreadApps admin console ─────────────
  {
    id: 'admin-start',
    title: 'Getting started',
    icon: 'house',
    who: ['platform'],
    steps: [
      { do: 'Sign in', flow: ['spreadapps-ai-lab.netlify.app', 'Username / email', 'Password', 'Sign in'] },
      { do: 'Stay signed in', flow: ['Tick Remember me'] },
      { do: 'Collapse menu', flow: ['⫷ icon', 'Icons only'] },
      { do: 'Expand menu', flow: ['Click logo'] },
    ],
  },
  {
    id: 'admin-overview',
    title: 'Overview',
    icon: 'layout-dashboard',
    route: '/admin',
    who: ['platform'],
    steps: [
      { do: 'See business', flow: ['Labs', 'MRR', 'Collected', 'Reports'] },
      { do: 'Open a lab', flow: ['Revenue by lab', 'Click lab'] },
    ],
  },
  {
    id: 'admin-labs',
    title: 'Labs (clients)',
    icon: 'building-2',
    route: '/admin/labs',
    who: ['platform'],
    steps: [
      { do: 'Add lab', flow: ['New lab', 'Name *', 'Subdomain *', 'Plan *', 'Trial days', 'Create lab'] },
      { do: 'Make it live', flow: ['Netlify', 'Domain management', 'Add domain alias', 'slug.spreadapps.in'] },
      { do: 'Branding', flow: ['Configure', 'Branding', 'Logo · Favicon · Cover', 'Colours', 'Save & publish'] },
      { do: 'Domain', flow: ['Configure', 'Domain', 'Subdomain · Token prefix', 'Save & publish'] },
      { do: 'Cover page', flow: ['Configure', 'Pages', 'Texts · Toggles', 'Save & publish'] },
      { do: 'Receipt paper', flow: ['Configure', 'Pages', 'Thermal 80 mm / A5 / A4', 'Save & publish'] },
      { do: 'Privacy officer', flow: ['Configure', 'Pages', 'Grievance officer · email · phone', 'Save & publish'] },
      { do: 'Online booking', flow: ['Configure', 'Pages', 'Online booking on/off', 'Home collection on/off', 'Save & publish'] },
      { do: 'Demo video', flow: ['Configure', 'Pages', '“How it works” video on/off', 'Own YouTube / .mp4 link (optional)', 'Save & publish'] },
      { do: 'Tests', flow: ['Configure', 'Tests', 'Add test', 'Code · Name · Price', 'Save & publish'] },
      { do: 'Result values', flow: ['Configure', 'Tests', 'Values', 'Standard template', 'Save & publish'] },
      { do: 'Analyzers', flow: ['Configure', 'Devices', 'Add device', 'Map codes', 'Generate key'] },
      { do: 'API keys', flow: ['Configure', 'API keys', 'WhatsApp · SMS · Razorpay · AI', 'Save & publish'] },
      { do: 'Turn on AI', flow: ['API keys', 'AI provider: anthropic', 'Lab’s own AI key', 'Save & publish', 'AI appears for that lab'] },
      { do: 'No AI', flow: ['Leave AI key empty', 'AI stays hidden'] },
      { do: 'Plan / trial', flow: ['Configure', 'Plan & billing', 'Plan', '+7 days / Activate', 'Save & publish'] },
      { do: 'First lab admin', flow: ['Configure', 'Admins & staff', 'Name', 'Lab admin', 'Password ↻', 'Create login', 'Share username'] },
      { do: 'Delete lab', flow: ['Admins & staff', 'Delete lab', 'Type subdomain', 'Delete'] },
    ],
  },
  {
    id: 'admin-plans',
    title: 'Plans & pricing',
    icon: 'wallet',
    route: '/admin/plans',
    who: ['platform'],
    steps: [
      { do: 'New plan', flow: ['New plan', 'Name · Code', 'Billing model', 'Prices', 'Save plan'] },
      { do: 'Edit plan', flow: ['Edit', 'Change', 'Save plan'] },
    ],
  },
  {
    id: 'admin-billing',
    title: 'Billing',
    icon: 'receipt',
    route: '/admin/billing',
    who: ['platform'],
    steps: [
      { do: 'Monthly invoices', flow: ['Generate invoices', 'One per active lab'] },
      { do: 'Confirm payment', flow: ['Payments to confirm', 'Check UTR in bank', 'Confirm / Not received'] },
      { do: 'Cash / cheque', flow: ['Due', 'Mark paid'] },
      { do: 'Overdue', flow: ['Due date + grace days', 'Lab paused', 'Paid → resumes'] },
      { do: 'Add a charge', flow: ['Lab', 'Plan & billing', 'Charge type', 'Amount · Due date', 'Notify lab', 'Add charge'] },
      { do: 'Charge types', flow: ['Database & hosting', 'Maintenance & support', 'Subscription', 'Setup', 'Other'] },
      { do: 'Remind', flow: ['Due', '🔔 Remind', 'Email + in-app banner'] },
    ],
  },
  {
    id: 'admin-announce',
    title: 'Announcements (email)',
    icon: 'megaphone',
    route: '/admin/announcements',
    who: ['platform'],
    steps: [
      { do: 'Write', flow: ['Template', 'Type', 'Subject *', 'Message *', '{{name}} · {{lab}}'] },
      { do: 'Choose who', flow: ['Lab admins / staff', 'Status', 'Labs', 'Recipient count'] },
      { do: 'Deliver via', flow: ['Email', 'In-app (bell)', 'Both'] },
      { do: 'Banner types', flow: ['Payment', 'Maintenance', 'Trial', 'Top of every page'] },
      { do: 'Check', flow: ['Preview', 'Send test to me', 'Inbox'] },
      { do: 'Send', flow: ['Send to N', 'Send now', 'Sent list'] },
    ],
  },
  TASKS('/admin', ['platform']),
  {
    id: 'admin-support',
    title: 'Support · Circles',
    icon: 'life-buoy',
    route: '/admin/support',
    who: ['platform'],
    steps: [
      { do: 'Handle ticket', flow: ['Open', 'Read', 'Screenshot', 'Status'] },
      { do: 'Read feedback', flow: ['Feedback', '★ rating', 'Message'] },
      { do: 'Demo requests', flow: ['Demo requests', 'Call / WhatsApp', 'Status'] },
    ],
  },
  {
    id: 'admin-sales',
    title: 'Sales page',
    icon: 'globe',
    who: ['platform'],
    steps: [
      { do: 'Open', flow: ['ailab.spreadapps.in'] },
      { do: 'Prices', flow: ['Plans & pricing', 'Edit', 'Shows live on sales page'] },
      { do: 'Leads', flow: ['Book a demo form', 'Support · Circles', 'Demo requests'] },
    ],
  },
  {
    id: 'admin-activity',
    title: 'Activity',
    icon: 'history',
    route: '/admin/activity',
    who: ['platform'],
    steps: [
      { do: 'See history', flow: ['Activity', 'Everything / SpreadApps / Mine'] },
      { do: 'Filter', flow: ['Patients · Tasks · Logins · Sign-ins · Support'] },
      { do: 'Older', flow: ['Show older'] },
    ],
  },
  {
    id: 'admin-team',
    title: 'SpreadApps team',
    icon: 'users',
    route: '/admin/team',
    who: ['root'],
    steps: [
      { do: 'Add admin', flow: ['Name *', 'Email', 'Password ↻', 'Create login'] },
      { do: 'Manage', flow: ['✉ Email', '🔑 Password', '⎋ Sign out everywhere', '🗑 Remove'] },
    ],
  },
  {
    id: 'admin-settings',
    title: 'Platform settings',
    icon: 'settings',
    route: '/admin/settings',
    who: ['root'],
    steps: [
      { do: 'Email sender', flow: ['From name', 'From address', 'Reply-to', 'Save'] },
      { do: 'Circles', flow: ['API URL', 'Project ID', 'Save'] },
      { do: 'Payments', flow: ['UPI ID', 'Payee name', 'Bank details', 'Grace days', 'Save'] },
    ],
  },
  ...PROFILE_SECURITY('/admin', ['platform']),

  // ───────────── Lab workspace ─────────────
  {
    id: 'lab-start',
    title: 'Getting started',
    icon: 'house',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Sign in', flow: ['yourlab.spreadapps.in/login', 'Username / email', 'Password', 'Sign in'] },
      { do: 'Forgot password', flow: ['Forgot?', 'Email', 'Reset link'] },
      { do: 'No email?', flow: ['Ask lab admin', 'New password'] },
      { do: 'Install app', flow: ['Browser menu', 'Install / Add to Home screen'] },
    ],
  },
  {
    id: 'lab-dashboard',
    title: 'Dashboard · patients',
    icon: 'layout-dashboard',
    route: '/lab',
    who: ['owner', 'staff'],
    steps: [
      { do: 'New patient', flow: ['New patient', 'Name *', 'Mobile', 'Age · Gender', 'Tests *', 'Consent ✓ *', 'Generate token'] },
      { do: 'Under 18', flow: ['Age < 18', 'Parent / guardian consents ✓'] },
      { do: 'Print receipt', flow: ['Generate token', 'Print receipt', 'Patient scans QR'] },
      { do: 'Reprint', flow: ['Card / Reports', '🖨 Print receipt'] },
      { do: 'Share token', flow: ['Copy tracking link', 'Give to patient'] },
      { do: 'Tube labels', flow: ['Card', 'Labels', 'Stick on tubes'] },
      { do: 'Change tests', flow: ['Card', 'Tests', 'Tick / untick', 'Update tests'] },
      { do: 'Enter results', flow: ['Card', 'Results', 'Type values', 'Verify & create report'] },
      { do: 'Process sample', flow: ['Start testing', 'Mark verified'] },
      { do: 'Or upload report', flow: ['Drop PDF', 'Report Ready'] },
      { do: 'AI explanation', flow: ['Drop PDF', 'Writing… (auto)', 'AI explanation ready', 'View'] },
      { do: 'AI failed?', flow: ['Explain with AI', 'Same action again'] },
      { do: 'Send report', flow: ['Notify / Share', 'WhatsApp', 'Delivered'] },
      { do: 'Find patient', flow: ['Search', 'Name · Token · Mobile'] },
      { do: 'Patient history', flow: ['Card', '🕘 History', 'All visits timeline'] },
    ],
  },
  {
    id: 'lab-reports',
    title: 'Reports',
    icon: 'file-text',
    route: '/lab/reports',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Find report', flow: ['Search', 'Name · Token · Mobile'] },
      { do: 'Open / share', flow: ['PDF', 'Copy link'] },
      { do: 'Trends', flow: ['Patient', '🕘 History', 'Trends across visits'] },
    ],
  },
  {
    id: 'lab-assistant',
    title: 'Ask AI',
    icon: 'bot',
    route: '/lab/assistant',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Ask', flow: ['Ask AI', 'Type a question', 'Enter'] },
      { do: 'Ideas', flow: ['Today’s revenue', 'Pending longest', 'Top tests', 'This week vs last'] },
      { do: 'Privacy', flow: ['Counts & tokens only', 'No names or phones'] },
    ],
  },
  {
    id: 'lab-reports-delete',
    title: 'Delete a visit',
    icon: 'trash-2',
    route: '/lab/reports',
    who: ['owner'],
    steps: [{ do: 'Delete', flow: ['Reports', '🗑', 'Delete visit'] }],
  },
  {
    id: 'lab-patient',
    title: 'Patient side',
    icon: 'smartphone',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Track', flow: ['Tracking link', 'Live status'] },
      { do: 'Download', flow: ['Report Ready', 'Download Official PDF'] },
      { do: 'Past visits', flow: ['Tracking link', 'Your earlier visits', 'Download PDF'] },
      { do: 'From cover page', flow: ['Track my report', 'Token', 'Check status'] },
    ],
  },
  TASKS('/lab', ['owner', 'staff']),
  {
    id: 'lab-bookings',
    title: 'Bookings',
    icon: 'calendar-clock',
    route: '/lab/bookings',
    who: ['owner', 'staff'],
    steps: [
      { do: 'New request', flow: ['Bookings', 'New', 'Prescription / tests'] },
      { do: 'Confirm', flow: ['Call / WhatsApp', 'Confirm', 'Note (optional)'] },
      { do: 'Patient arrives', flow: ['Confirmed', 'Patient arrived · register', 'Token + receipt'] },
      { do: 'Cancel', flow: ['Cancel', 'Reason for patient'] },
      { do: 'Share page', flow: ['Open booking page', 'Copy link', 'WhatsApp / Google profile'] },
    ],
  },
  {
    id: 'lab-results',
    title: 'Results',
    icon: 'microscope',
    route: '/lab/results',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Enter results', flow: ['Results', 'Pick patient', 'Type values', 'Save'] },
      { do: 'From a card', flow: ['Patient card', 'Results'] },
      { do: 'Flags', flow: ['✓ normal', 'H ↑ high', 'L ↓ low', 'Calculated values fill in'] },
      { do: 'Verify', flow: ['Lab admin / Pathologist', 'Verify & create report', 'PDF ready', 'Share'] },
      { do: 'Machine results', flow: ['From analyzer', 'Check', 'Verify & create report'] },
      { do: 'Tube labels', flow: ['Patient card', 'Labels', 'Stick on tubes'] },
      { do: 'Change tests', flow: ['Patient card', 'Tests', 'Tick / untick', 'Update tests'] },
    ],
  },
  {
    id: 'lab-devices',
    title: 'Devices',
    icon: 'monitor',
    route: '/lab/devices',
    who: ['owner'],
    steps: [
      { do: 'Add analyzer', flow: ['Add device', 'Name · Type', 'ASTM / HL7', 'Serial / LAN', 'Save'] },
      { do: 'Map codes', flow: ['Auto-map a test', 'Edit machine codes', 'Save'] },
      { do: 'Connect', flow: ['Generate key', 'Paste in Lab Connector'] },
      { do: 'Try it', flow: ['Send test message', 'Token', 'Send', 'Results'] },
      { do: 'Problems', flow: ['Message log', '✗ not matched', 'Fix mapping'] },
    ],
  },
  {
    id: 'lab-tests',
    title: 'Tests & prices',
    icon: 'test-tube',
    route: '/lab/tests',
    who: ['owner'],
    steps: [
      { do: 'Add test', flow: ['Add test', 'Code · Name', 'Price', 'Hours', 'Save'] },
      { do: 'Result values', flow: ['Values', 'Use standard template', 'Check ranges', 'Done', 'Save'] },
      { do: 'Own values', flow: ['Values', 'Add parameter', 'Code · Name · Unit · Range', 'Formula (optional)', 'Done', 'Save'] },
      { do: 'Remove test', flow: ['🗑', 'Save'] },
    ],
  },
  {
    id: 'lab-team',
    title: 'Plan & team',
    icon: 'settings',
    route: '/lab/account',
    who: ['owner'],
    steps: [
      { do: 'See plan', flow: ['Plan', 'Trial', 'Invoices'] },
      { do: 'Pay invoice', flow: ['Invoices', 'Pay now', 'Scan UPI QR', 'Enter UTR', 'Submit'] },
      { do: 'After paying', flow: ['Verifying', 'SpreadApps confirms', 'Paid ✓'] },
      { do: 'Overdue', flow: ['New patients paused', 'Pay now', 'Resumes when confirmed'] },
      { do: 'Add staff', flow: ['Name *', 'Role', 'Job title', 'Password ↻', 'Create login', 'Share username'] },
      { do: 'Manage', flow: ['✉ Email', '🔑 Password', '⎋ Sign out everywhere', '🗑 Remove'] },
    ],
  },
  {
    id: 'lab-activity',
    title: 'Activity',
    icon: 'history',
    route: '/lab/activity',
    who: ['owner', 'staff'],
    steps: [
      { do: 'My history', flow: ['Activity', 'Mine'] },
      { do: 'Lab history', flow: ['Activity', 'Whole lab / Patients'] },
      { do: 'Filter', flow: ['Patients · Tasks · Logins · Sign-ins'] },
    ],
  },
  {
    id: 'lab-updates',
    title: 'Updates from SpreadApps',
    icon: 'bell',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Read updates', flow: ['🔔 Bell', 'Pick message', 'Got it'] },
      { do: 'Banner', flow: ['Read', 'Dismiss ✕'] },
      { do: 'Clear count', flow: ['🔔 Bell', 'Mark all read'] },
    ],
  },
  {
    id: 'lab-support',
    title: 'Support',
    icon: 'life-buoy',
    who: ['owner', 'staff'],
    steps: [
      { do: 'Raise ticket', flow: ['Need help?', 'Summary *', 'Details', 'Priority', 'Screenshot', 'Submit'] },
      { do: 'Give feedback', flow: ['★ rating', 'Type', 'Message', 'Send'] },
    ],
  },
  ...PROFILE_SECURITY('/lab', ['owner', 'staff']),
];
