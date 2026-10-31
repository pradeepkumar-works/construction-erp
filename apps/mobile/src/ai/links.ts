/**
 * The site app's screen for a link in an answer. Answers link to the web app's paths (`/dpr/<id>`,
 * `/purchase-orders/<id>`, `/risks?id=<id>`); each maps to the phone's own screen, or to null when the phone has none,
 * and the link is then shown as plain text.
 */
const RECORDS: Record<string, string> = {
  correspondence: '/letter/',
  dpr: '/dpr/',
  progress: '/progress/',
  machinery: '/machinery/',
  'material-requests': '/material-request/',
  expenses: '/expense/',
  measurements: '/measurement/',
  inspections: '/inspection/',
  bills: '/bill/',
  'purchase-orders': '/purchase-order/',
  'vendor-bills': '/vendor-bill/',
  'work-orders': '/work-order/',
  'subcontract-bills': '/subcontract-bill/',
  'payment-requests': '/payment-request/',
  'supplier-choices': '/supplier-choice/',
  projects: '/project/',
};

const LISTS: Record<string, string> = { attendance: '/attendance', stock: '/stock', documents: '/documents', risks: '/risks', safety: '/safety' };

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function phoneRoute(href: string): string | null {
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  const [path, query = ''] = href.split('?');
  const [, first, second] = path.split('/');
  const params = new URLSearchParams(query);
  if (first && second && ID.test(second) && RECORDS[first]) return `${RECORDS[first]}${second}`;
  // A page of a filed PDF (Ask the contract)
  const file = params.get('file');
  if (first === 'documents' && second === 'view' && file && ID.test(file)) return `/document-page?file=${file}&page=${Number(params.get('page')) || 1}`;
  const id = params.get('id');
  // A drawing in the viewer, or a document opened in the register
  if (first === 'documents' && (second === 'drawing' || !second) && id && ID.test(id)) return `/drawing/${id}`;
  if (first === 'risks' && id && ID.test(id)) return `/risk/${id}`;
  if (first === 'safety' && params.get('tab') === 'incidents' && id && ID.test(id)) return `/incident/${id}`;
  if (first && !second && LISTS[first]) return LISTS[first];
  return null;
}
