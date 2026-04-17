import { useState, useEffect } from 'react';
import { AppProvider } from './context/AppContext';
import { useApp } from './context/useApp';
import Sidebar from './components/Sidebar';
import { Toast } from './components/UI';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Companies from './pages/Companies';
import FoodCategories from './pages/FoodCategories';
import FoodMenu from './pages/FoodMenu';
import MenuTree from './pages/MenuTree';
import Users from './pages/Users';
import UserRoles from './pages/UserRoles';
import RoleMappings from './pages/RoleMappings';
import QRCodes from './pages/QRCodes';
import Images from './pages/Images';
import POS from './pages/POS';
import Tables from './pages/Tables';
import Kitchen from './pages/Kitchen';
import SalesReport from './pages/SalesReport';
import OrdersReport from './pages/OrdersReport';
import PaymentMethods  from './pages/PaymentMethods';
import CrmCustomers   from './pages/CrmCustomers';
import CrmPromoCodes  from './pages/CrmPromoCodes';
import CrmLoyalty     from './pages/CrmLoyalty';
import CrmFeedback    from './pages/CrmFeedback';
import CrmReservations from './pages/CrmReservations';
import CrmCampaigns   from './pages/CrmCampaigns';
import SmsSettings    from './pages/SmsSettings';
import WhatsAppSettings from './pages/WhatsAppSettings';
import GenericPage from './pages/GenericPage';
import DineIn from './pages/DineIn';
import MenuPublic from './pages/MenuPublic';
import QRGenerator from './pages/QRGenerator';
import WhatsAppLogs from './pages/WhatsAppLogs';
import ContactLeads from './pages/ContactLeads';

const URL_TO_PAGE = {
  '/home':                        Dashboard,
  '/dashboard':                   Dashboard,
  '/sale':                        POS,
  '/pos':                         POS,
  '/company':                     Companies,
  '/company/list':                Companies,
  '/company/images':              Images,
  '/company/qr-codes':            QRCodes,
  '/master/food-menu-categories': FoodCategories,
  '/master/food-menus':           FoodMenu,
  '/setting/users':               Users,
  '/setting/roles':               UserRoles,
  '/setting/role-mappings':       RoleMappings,
  '/all-screens':                 MenuTree,
  '/master/tables':               Tables,
  '/kitchen':                     Kitchen,
  '/kitchen/display':             Kitchen,
  '/pos/kitchen':                 Kitchen,
  '/report/sales':                SalesReport,
  '/sales-report':                SalesReport,
  '/report':                      SalesReport,
  '/orders':                      OrdersReport,
  '/report/orders':               OrdersReport,
  '/all-orders':                  OrdersReport,
  '/master/payment-methods':      PaymentMethods,
  '/master/sms-settings':         SmsSettings,
  '/master/whatsapp-settings':    WhatsAppSettings,
  '/crm/customers':               CrmCustomers,
  '/crm/promo-codes':             CrmPromoCodes,
  '/crm/loyalty':                 CrmLoyalty,
  '/crm/feedback':                CrmFeedback,
  '/crm/reservations':            CrmReservations,
  '/crm/campaigns':               CrmCampaigns,
  '/payment-methods':             PaymentMethods,
  '/pos/tables':                  Tables,
  '/dine-in':                     DineIn,
  '/menu':                        MenuPublic,
  '/qr-generator':                QRGenerator,
  '/whatsapp-logs':               WhatsAppLogs,
  '/contact-leads':               ContactLeads,
};

// ── Offline Banner ────────────────────────────────────────────
function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showBack, setShowBack] = useState(false);

  useEffect(() => {
    const goOffline = () => { setIsOnline(false); setShowBack(false); };
    const goOnline  = () => {
      setIsOnline(true);
      setShowBack(true);
      setTimeout(() => setShowBack(false), 4000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online',  goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online',  goOnline);
    };
  }, []);

  if (isOnline && !showBack) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      padding: '10px 20px',
      textAlign: 'center',
      fontWeight: 600,
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      background: isOnline ? '#16a34a' : '#dc2626',
      color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      transition: 'background 0.3s',
    }}>
      {isOnline
        ? '✅ Back online! Syncing data...'
        : '📴 You are offline — Cash & UPI payments still work'}
    </div>
  );
}

function AppInner() {
  const { user, logout, showToast } = useApp();
  useKeepAlive();
  const [activePage, setActivePage] = useState('/home');
  const [activeMenu, setActiveMenu] = useState(null);

  // Public menu page - no login required
  if (window.location.pathname.startsWith('/menu/')) {
    return <MenuPublic />;
  }

  if (!user) return <Login />;

  const handleMenuChange = (menuurl, menuItem) => {
    setActivePage(menuurl);
    setActiveMenu(menuItem);
  };

  const PageComponent = URL_TO_PAGE[activePage] || GenericPage;

  return (
    <div className="app-layout">
      <OfflineBanner />
      <Sidebar
        activePage={activePage}
        onChange={handleMenuChange}
        onLogout={() => { logout(); showToast('Logged out successfully'); }}
      />
      <main className="app-main">
        <PageComponent menuItem={activeMenu} onNavigate={(url) => handleMenuChange(url, null)} />
      </main>
      <Toast />
    </div>
  );
}

const BACKEND = 'https://currycloud.mooo.com';

function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${BACKEND}/health`).catch(() =>
      fetch(`${BACKEND}/company/`).catch(() => {})
    );
    ping();
    const id = setInterval(ping, 4 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
}

export default function App() {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}