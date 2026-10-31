import { redirect } from 'next/navigation';

/** Activity templates became part of Project types; old links and bookmarks land there. */
export default function Page() {
  redirect('/project-types');
}
