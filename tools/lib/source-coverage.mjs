export const PARTIAL_HISTORY='opening-and-latest-10';

export function selectedPostStream(stream,old,history,id) {
  if(history!==undefined&&history!=='full'&&history!==PARTIAL_HISTORY)throw new Error(`Thread ${id}: unknown history ${history}`);
  const previous=old?.source_coverage;
  if(previous!==undefined&&(previous.policy!==PARTIAL_HISTORY||!Array.isArray(previous.omitted_forum_ids)||previous.omitted_forum_ids.some(key=>!Number.isSafeInteger(key)||key<1)||new Set(previous.omitted_forum_ids).size!==previous.omitted_forum_ids.length))throw new Error(`Thread ${id}: invalid retained source coverage`);
  if(previous===undefined&&history!==PARTIAL_HISTORY)return {stream};
  if(previous===undefined&&old!==undefined)throw new Error(`Thread ${id}: cannot truncate an existing full history`);
  // Retain the same omitted IDs on subsequent pulls: the retained range grows
  // with new replies rather than discarding previously selected posts.
  const omitted=previous?.omitted_forum_ids??stream.slice(1,Math.max(1,stream.length-10));
  const selected=stream.filter(key=>!omitted.includes(key));
  return {stream:selected,coverage:{policy:PARTIAL_HISTORY,omitted_forum_ids:omitted,available_posts:stream.length,omitted_posts:stream.length-selected.length}};
}
