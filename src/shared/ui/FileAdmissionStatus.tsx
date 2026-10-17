import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useAuth } from '../../features/auth/AuthProvider';
import './file-admission-status.css';
type Job = { id: string; status: string; path: string };
const labels: Record<string, string> = { receiving: 'Загрузка', queued: 'Ожидает проверки', validating: 'Проверяется', completed: 'Готово', failed: 'Завершилось ошибкой' };
export function FileAdmissionStatus() {
  const { session } = useAuth();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setJobs([]); setOpen(false); setError('');
    if (!session) return;
    let stopped = false;
    let timer: number | undefined;
    let running = false;
    const load = async () => {
      if (running || stopped) return;
      running = true;
      try { const value = await api.getFileAdmissions(); if (!stopped) { setJobs(value.items); setError(''); } }
      catch { if (!stopped) setError('Не удалось обновить состояние проверок.'); }
      finally { running = false; if (!stopped) timer = window.setTimeout(load, 3000); }
    };
    const refresh = () => { window.clearTimeout(timer); void load(); };
    void load(); window.addEventListener('verbatrace:file-admission', refresh);
    return () => { stopped = true; window.clearTimeout(timer); window.removeEventListener('verbatrace:file-admission', refresh); };
  }, [session?.user.id]);
  if (!session || !jobs.length) return null;
  const active = jobs.filter(job => !['completed', 'failed'].includes(job.status)).length;
  return <aside className="file-admission-status" aria-label="Проверка загруженных файлов"><button type="button" aria-expanded={open} aria-controls="file-admission-list" onClick={() => setOpen(value => !value)}>Проверка файлов{active ? `: ${active}` : ''}</button>{open ? <section id="file-admission-list"><p>Проверка продолжается, пока вы работаете в других разделах.</p>{error ? <p role="status">{error}</p> : null}<ul>{jobs.map(job => <li key={job.id}><span>{job.path.includes('/calls') ? 'Запись' : job.path.includes('/avatar') ? 'Аватар' : 'Инструкция'}</span><span>{labels[job.status] ?? 'Обновление состояния'}</span></li>)}</ul></section> : null}</aside>;
}
