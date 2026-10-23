/**
 * The test model's reading of a DPR remark the rules could not place (AI_PROVIDER=fake): a hindrance of no known cause,
 * titled from the remark's first clause, so the model's path (source MODEL) is exercised without a model.
 */
export function fakeHindranceReply(text: string): string {
  const remark = (text.match(/Remark: (.+)/)?.[1] ?? '').trim();
  const title = remark.split(/[.;,]/)[0].trim().slice(0, 80) || 'Work held up';
  return JSON.stringify({ hindrance: true, category: 'OTHER', party: null, title });
}
