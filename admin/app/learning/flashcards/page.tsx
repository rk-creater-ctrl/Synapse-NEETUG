'use client';

import { useEffect, useMemo, useState } from 'react';
import { FlashcardForm } from './FlashcardForm';

const api = process.env.NEXT_PUBLIC_API_URL!;
export default function FlashcardsPage() {
  const [items, setItems] = useState<any[]>([]); const [editing, setEditing] = useState<any | null>(null); const [creating, setCreating] = useState(false); const [search, setSearch] = useState(''); const [error, setError] = useState('');
  const token = () => JSON.parse(localStorage.getItem('synapse_tokens') || '{}').accessToken;
  const load = async () => { const accessToken = token(); if (!accessToken) { location.href = '/login'; return; } const response = await fetch(`${api}/admin/learning/flashcards`, { headers: { Authorization: `Bearer ${accessToken}` } }); if (response.ok) setItems(await response.json()); else setError('Unable to load flashcards.'); };
  useEffect(() => { load(); }, []);
  const patch = async (item: any, value: object, confirmDeactivate = false) => { if (confirmDeactivate && item.isActive && !confirm('Deactivate this flashcard?')) return; const response = await fetch(`${api}/admin/learning/flashcards/${item.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token()}` }, body: JSON.stringify(value) }); if (!response.ok) setError('Unable to update flashcard.'); await load(); };
  const visible = useMemo(() => items.filter((item) => `${item.title || ''} ${item.frontContent}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  return <div><div className="card"><h1>Learning flashcards</h1><input placeholder="Search flashcards" value={search} onChange={(event) => setSearch(event.target.value)} /><button onClick={() => { setEditing(null); setCreating(true); }}>Create flashcard</button>{error && <p>{error}</p>}{!visible.length ? <p className="muted">No flashcards found.</p> : <table><thead><tr><th>Front</th><th>Sort</th><th>Premium</th><th>Published</th><th>Active</th><th>Actions</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td>{item.title || item.frontContent}</td><td>{item.sortOrder}</td><td>{String(item.isPremium)}</td><td>{String(item.isPublished)}</td><td>{String(item.isActive)}</td><td><button onClick={() => { setCreating(false); setEditing(item); }}>Edit</button> <button onClick={() => patch(item, { isPublished: !item.isPublished })}>{item.isPublished ? 'Unpublish' : 'Publish'}</button> <button onClick={() => patch(item, { isActive: !item.isActive }, true)}>{item.isActive ? 'Deactivate' : 'Activate'}</button> <button onClick={() => patch(item, { isPremium: !item.isPremium })}>{item.isPremium ? 'Make free' : 'Make premium'}</button></td></tr>)}</tbody></table>}</div>{(creating || editing) && <FlashcardForm key={editing?.id ?? 'create'} editing={editing || undefined} onSaved={() => { setCreating(false); setEditing(null); load(); }} onCancel={() => { setCreating(false); setEditing(null); }} />}</div>;
}
