'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { clearAdminSession, getAccessToken, redirectToLogin } from '../../lib/auth';

const academicRoutes = ['exams', 'subjects', 'classes', 'chapters', 'topics', 'subtopics'];

export default function DashboardPage() {
  useEffect(() => {
    if (!getAccessToken()) redirectToLogin();
  }, []);

  return (
    <div className="card">
      <button onClick={() => { clearAdminSession(); window.location.assign('/login'); }}>Logout</button>
      <h1>Academic and learning management</h1>
      <ul>
        {academicRoutes.map((route) => <li key={route}><Link href={`/academics/${route}`}>{route}</Link></li>)}
        <li><Link href="/learning/videos">Videos</Link></li>
        <li><Link href="/learning/revision">Revision content</Link></li>
        <li><Link href="/learning/flashcards">Flashcards</Link></li>
        <li><Link href="/learning/questions">QBank questions</Link></li>
        <li><Link href="/learning/tests">Formal tests</Link></li>
        <li><Link href="/media-assets">Media assets</Link></li>
        <li><Link href="/content-imports">Bulk content import</Link></li>
      </ul>
    </div>
  );
}
