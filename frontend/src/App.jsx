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

const URL_TO_PAGE = {
  '/home':                        Dashboard,
  '/dashboard':                   Dashboard,
  '/sale':                        POS,          // ← POS mapped to /sale from menu table
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
};

function AppInner() {
  const { user, logout, showToast } = useApp();
  useKeepAlive();
  const [activePage, setActivePage] = useState('/home');
  const [activeMenu, setActiveMenu] = useState(null);

  if (!user) return <Login />;

  const handleMenuChange = (menuurl, menuItem) => {
    setActivePage(menuurl);
    setActiveMenu(menuItem);
  };

  const PageComponent = URL_TO_PAGE[activePage] || GenericPage;

  return (
    <div className="app-layout">
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

// Keep Railway backend awake — pings every 4 minutes
function useKeepAlive() {
  useEffect(() => {
    const ping = () => fetch(`${BACKEND}/health`).catch(() =>
      fetch(`${BACKEND}/company/`).catch(() => {})
    );
    ping(); // immediate ping on app load
    const id = setInterval(ping, 4 * 60 * 1000); // every 4 min
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
