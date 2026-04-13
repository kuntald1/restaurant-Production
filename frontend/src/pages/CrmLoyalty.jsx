import { useApp } from '../context/useApp';
import { PageHeader } from '../components/UI';

export default function CrmLoyalty() {
  const { selectedCompany } = useApp();
  const titles = { CrmLoyalty:'Loyalty Points', CrmFeedback:'Feedback & Reviews', CrmReservations:'Reservations', CrmCampaigns:'Campaigns' };
  const icons  = { CrmLoyalty:'🏆', CrmFeedback:'⭐', CrmReservations:'📅', CrmCampaigns:'📣' };
  const name   = 'CrmLoyalty';
  return (
    <div className="page">
      <PageHeader title={titles[name]} subtitle={selectedCompany?.name || ''} />
      <div className="empty-state">
        <div className="empty-icon">{icons[name]}</div>
        <h3>{titles[name]}</h3>
        <p style={{color:'var(--text-3)',marginTop:8}}>Coming soon — under development</p>
      </div>
    </div>
  );
}
