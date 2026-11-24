import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';
import RoomsTab from './RoomsTab';
import ActivitiesTab from './ActivitiesTab';
import IndicatorsTab from './IndicatorsTab';

const TABS = [
  { id: 'ruangan', label: 'Ruangan & Alat' },
  { id: 'kegiatan', label: 'Kegiatan' },
  { id: 'indikator', label: 'Indikator' },
];

export default function MasterPage() {
  const { isAdmin } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'ruangan';
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col gap-4 p-4 lg:p-0">
      <h1 className="pt-2 text-xl font-extrabold lg:text-[26px]">Kelola Master</h1>
      <div role="tablist" className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 lg:mx-0 lg:px-0">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={cn('h-11 shrink-0 border-b-[3px] px-3 text-sm whitespace-nowrap',
              tab === t.id ? 'border-brand font-bold text-brand' : 'border-transparent font-semibold text-subtle')}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'ruangan' && <RoomsTab />}
      {tab === 'kegiatan' && <ActivitiesTab initialEquipment={params.get('alat')} />}
      {tab === 'indikator' && <IndicatorsTab />}
    </div>
  );
}
