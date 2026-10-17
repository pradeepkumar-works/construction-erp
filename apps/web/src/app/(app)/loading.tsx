import { PageSkeleton } from '@/components/common/QueryState';

/** Shown inside the shell while a page's code loads on the way to it (item 83): a page of placeholders, not a blank area. */
export default function Loading() {
  return (
    <div className="page-container">
      <PageSkeleton />
    </div>
  );
}
