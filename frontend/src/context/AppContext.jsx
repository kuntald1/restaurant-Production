import { createContext, useState } from 'react';
import { companyAPI, smsSettingsAPI } from '../services/api';

export const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
  const [user,             setUser]             = useState(() => { try { return JSON.parse(sessionStorage.getItem('rms_user'))    || null; } catch { return null; } });
  const [menus,            setMenus]            = useState(() => { try { return JSON.parse(sessionStorage.getItem('rms_menus'))   || [];   } catch { return [];   } });
  const [selectedCompany,  setSelectedCompanyState] = useState(() => { try { return JSON.parse(sessionStorage.getItem('rms_company')) || null; } catch { return null; } });
  const [allCompanies,     setAllCompanies]     = useState(() => { try { return JSON.parse(sessionStorage.getItem('rms_all_companies')) || []; } catch { return []; } });
  const [companySettings,  setCompanySettings]  = useState(() => { try { return JSON.parse(sessionStorage.getItem('rms_company_settings')) || {}; } catch { return {}; } });
  const [toast,            setToast]            = useState(null);

  const login = async (loginResponse) => {
    const { user_details, menus: userMenus } = loginResponse;
    setUser(user_details);
    setMenus(userMenus || []);
    sessionStorage.setItem('rms_user',  JSON.stringify(user_details));
    sessionStorage.setItem('rms_menus', JSON.stringify(userMenus || []));

    // Store company_settings from login response (includes is_merchant_enabled, razorpay_key_id etc.)
    const cs = loginResponse.company_settings || {};
    setCompanySettings(cs);
    sessionStorage.setItem('rms_company_settings', JSON.stringify(cs));

    const cid    = user_details?.company_unique_id;
    const isSuperAdmin = user_details?.is_super_admin;
    const isAdmin      = user_details?.is_admin;

    try {
      const all = await companyAPI.getAll();
      setAllCompanies(all);
      sessionStorage.setItem('rms_all_companies', JSON.stringify(all));

      let selected = null;

      if (isSuperAdmin) {
        // Super admin → auto-select the company matching their company_unique_id
        selected = all.find(c => c.company_unique_id === cid) || all[0] || null;
      } else if (isAdmin) {
        // Admin → only their own company
        selected = all.find(c => c.company_unique_id === cid) || null;
      } else {
        // Staff → same, use their company_unique_id
        selected = all.find(c => c.company_unique_id === cid) || null;
      }

      if (selected) {
        setSelectedCompanyState(selected);
        sessionStorage.setItem('rms_company', JSON.stringify(selected));

        // Load SMS/WhatsApp settings and merge into companySettings
        try {
          const sms = await smsSettingsAPI.get(selected.company_unique_id);
          const merged = {
            ...cs,
            is_whatsapp_enabled:    sms.whatsapp_enabled    ?? false,
            is_sms_enabled:         sms.sms_enabled         ?? false,
            whatsapp_template_bill: sms.template_bill       ?? '',
            whatsapp_from_number:   sms.from_number         ?? '',
            whatsapp_account_sid:   sms.account_sid         ?? '',
            // sgst/cgst come from login company_settings
            sgst: cs.sgst ?? 0,
            cgst: cs.cgst ?? 0,
          };
          setCompanySettings(merged);
          sessionStorage.setItem('rms_company_settings', JSON.stringify(merged));
        } catch {
          // SMS settings not yet configured — silently skip
        }
      }
    } catch (e) {
      // Fallback: try direct lookup
      if (cid) {
        try {
          const company = await companyAPI.getByUniqueId(cid);
          setSelectedCompanyState(company);
          sessionStorage.setItem('rms_company', JSON.stringify(company));
        } catch {}
      }
    }
  };

  const logout = () => {
    setUser(null);
    setMenus([]);
    setSelectedCompanyState(null);
    setAllCompanies([]);
    setCompanySettings({});
    sessionStorage.clear();
  };

  const setSelectedCompany = (company) => {
    setSelectedCompanyState(company);
    if (company) sessionStorage.setItem('rms_company', JSON.stringify(company));
    else sessionStorage.removeItem('rms_company');
  };

  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <AppContext.Provider value={{
      user, menus, login, logout,
      selectedCompany, setSelectedCompany,
      allCompanies, setAllCompanies,
      companySettings, setCompanySettings,
      toast, showToast,
    }}>
      {children}
    </AppContext.Provider>
  );
};
