import { useEffect, useState, useCallback } from 'react';
import { userRolesAPI, roleMappingAPI, menuAPI } from '../services/api';
import { Table, Modal, Badge, Spinner, PageHeader, FormField, Input, Textarea, ConfirmDialog } from '../components/UI';
import { useApp } from '../context/useApp';

const EMPTY = { company_unique_id: '', role_name: '', description: '', is_active: true };

// Flatten nested menu tree into a list preserving parent info
function flattenMenuTree(nodes, depth = 0, result = []) {
  for (const n of nodes) {
    result.push({
      id:       n.menuid,
      name:     n.menuname,
      url:      n.menuurl,
      icon:     n.menuicon,
      desc:     n.menudesc,
      parentid: n.parentmenuid,
      depth,
    });
    if (n.children?.length) flattenMenuTree(n.children, depth + 1, result);
  }
  return result;
}

export default function UserRoles() {
  const { selectedCompany, showToast, user, allCompanies } = useApp();
  const isSuperAdmin = user?.is_super_admin === true;
  const isAdmin      = user?.is_admin      === true;
  const cid = selectedCompany?.company_unique_id;

  const [roles,       setRoles]       = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [modal,       setModal]       = useState(null); // 'create' | 'edit' | 'permissions'
  const [form,        setForm]        = useState(EMPTY);
  const [editId,      setEditId]      = useState(null);
  const [confirm,     setConfirm]     = useState(null);
  const [saving,      setSaving]      = useState(false);

  // Permission panel state
  const [permRole,    setPermRole]    = useState(null);   // role object
  const [allMenus,    setAllMenus]    = useState([]);     // flat menu list
  const [mappings,    setMappings]    = useState([]);     // existing userrolemappings for this role
  const [permLoading, setPermLoading] = useState(false);
  const [toggling,    setToggling]    = useState(null);   // menu_id being toggled
  const [searchMenu,  setSearchMenu]  = useState('');

  // ── Load roles ───────────────────────────────────────────
  const loadRoles = useCallback(async () => {
    if (!cid) return;
    setLoading(true);
    try {
      const all = await userRolesAPI.getAll(cid);
      // Admin users cannot see or manage Super Admin roles
      const filtered = isSuperAdmin
        ? all
        : all.filter(r => !(r.role_name || '').toLowerCase().includes('super'));
      setRoles(filtered);
    } catch { setRoles([]); }
    setLoading(false);
  }, [cid]);

  useEffect(() => { loadRoles(); }, [cid]);

  // ── Load permissions for a role ───────────────────────────
  const openPermissions = async (role) => {
    setPermRole(role);
    setModal('permissions');
    setPermLoading(true);
    setSearchMenu('');
    try {
      const [menuTree, roleMaps] = await Promise.allSettled([
        // Menu TREE → has real names, urls, icons, parent structure
        menuAPI.getByCompany(cid),
        // Mappings for THIS role → which boxes are checked
        roleMappingAPI.getMenusByRole(cid, role.userrole_id),
      ]);

      // Flatten menu tree preserving parent/child structure and real names
      const allMenuList = menuTree.status === 'fulfilled'
        ? flattenMenuTree(menuTree.value)
        : [];

      setAllMenus(allMenuList);
      setMappings(roleMaps.status === 'fulfilled' ? roleMaps.value : []);
    } catch (e) {
      console.error(e);
      setAllMenus([]); setMappings([]);
    }
    setPermLoading(false);
  };

  // ── Toggle a menu permission ──────────────────────────────
  const toggleMenu = async (menuItem) => {
    const existing = mappings.find(m => m.menu_id === menuItem.id);
    setToggling(menuItem.id);
    try {
      if (existing) {
        // UNCHECK → soft delete
        await roleMappingAPI.delete(existing.userrolemapping_id);
        setMappings(prev => prev.filter(m => m.menu_id !== menuItem.id));
      } else {
        // CHECK → create (backend now handles UPSERT — reactivates if soft-deleted)
        const newMap = await roleMappingAPI.create({
          userrole_id:       permRole.userrole_id,
          menu_id:           menuItem.id,
          company_unique_id: cid,
          is_active:         true,
          created_by:        1,
        });
        setMappings(prev => [...prev, newMap]);
      }
    } catch (e) { showToast(e.message, 'error'); }
    setToggling(null);
  };

  // Select All / Deselect All
  const selectAll = async () => {
    const unselected = filtered.filter(m => !mappings.find(x => x.menu_id === m.id));
    for (const m of unselected) {
      try {
        const newMap = await roleMappingAPI.create({
          userrole_id: permRole.userrole_id, menu_id: m.id,
          company_unique_id: cid, is_active: true, created_by: 1,
        });
        setMappings(prev => [...prev, newMap]);
      } catch {}
    }
    showToast('All menus selected!');
  };

  const deselectAll = async () => {
    const selected = mappings.filter(m => filtered.find(f => f.id === m.menu_id));
    for (const m of selected) {
      try {
        await roleMappingAPI.delete(m.userrolemapping_id);
        setMappings(prev => prev.filter(x => x.userrolemapping_id !== m.userrolemapping_id));
      } catch {}
    }
    showToast('All menus removed');
  };

  // ── Role CRUD ─────────────────────────────────────────────
  const openCreate = () => { setForm({ ...EMPTY, company_unique_id: cid }); setModal('create'); };
  const openEdit   = (r)  => { setForm({ ...r }); setEditId(r.userrole_id); setModal('edit'); };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        company_unique_id: parseInt(form.company_unique_id),
        description: form.description?.trim() || null,
        created_by: user?.user_id || null,
      };
      if (modal === 'create') { await userRolesAPI.create(payload);          showToast('Role created!'); }
      else                    { await userRolesAPI.update(editId, payload);  showToast('Role updated!'); }
      setModal(null); loadRoles();
    } catch (e) { showToast(e.message, 'error'); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    try { await userRolesAPI.delete(id); showToast('Role deleted'); loadRoles(); }
    catch (e) { showToast(e.message, 'error'); }
    setConfirm(null);
  };

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  // Filtered menus for search
  const filtered = allMenus.filter(m =>
    !searchMenu || m.name.toLowerCase().includes(searchMenu.toLowerCase()) || (m.url || '').toLowerCase().includes(searchMenu.toLowerCase())
  );

  const checkedCount = mappings.length;
  const totalCount   = allMenus.length;

  const cols = [
    { key: 'userrole_id', label: 'ID', render: v => <span style={{ color: 'var(--text-3)', fontSize: 12 }}>#{v}</span> },
    { key: 'role_name',   label: 'Role Name', render: v => <strong>{v}</strong> },
    { key: 'description', label: 'Description', render: v => <span style={{ color: 'var(--text-2)', fontSize: 13 }}>{v || '—'}</span> },
    { key: 'created_at',  label: 'Created', render: v => v ? new Date(v).toLocaleDateString() : '—' },
    { key: 'is_active',   label: 'Status', render: v => <Badge variant={v ? 'success' : 'error'}>{v ? 'Active' : 'Inactive'}</Badge> },
  ];

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <PageHeader
        title="Role & Permission"
        subtitle={`Manage roles and menu permissions for ${selectedCompany.name}`}
        action={<button className="btn btn-primary" onClick={openCreate}>+ New Role</button>}
      />

      {loading ? <Spinner /> : (
        <Table columns={cols} data={roles} actions={(row) => (
          <div className="action-btns">
            <button className="btn btn-sm btn-outline" onClick={() => openPermissions(row)}
              style={{ background: 'var(--primary-light)', color: 'var(--primary)', borderColor: 'var(--border-mid)' }}>
              🔑 Permissions
            </button>
            <button className="btn btn-sm btn-outline" onClick={() => openEdit(row)}>Edit</button>
            <button className="btn btn-sm btn-danger-ghost" onClick={() => setConfirm(row.userrole_id)}>Delete</button>
          </div>
        )} />
      )}

      {confirm && <ConfirmDialog message="Delete this role?" onConfirm={() => handleDelete(confirm)} onCancel={() => setConfirm(null)} />}

      {/* ── Create / Edit Role ── */}
      {(modal === 'create' || modal === 'edit') && (
        <Modal title={modal === 'create' ? 'New Role' : 'Edit Role'} onClose={() => setModal(null)}>
          <form onSubmit={handleSubmit}>
            <FormField label="Role Name" required>
              <Input value={form.role_name} onChange={set('role_name')} placeholder="e.g. Manager, Cashier, Chef" required />
            </FormField>
            <FormField label="Description">
              <Textarea value={form.description} onChange={set('description')} rows={3} placeholder="Brief description of this role…" />
            </FormField>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Permissions Panel ── */}
      {modal === 'permissions' && permRole && (
        <div style={PS.overlay} onClick={() => setModal(null)}>
          <div style={PS.panel} onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div style={PS.header}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={PS.roleIcon}>🔑</div>
                <div>
                  <div style={PS.roleTitle}>{permRole.role_name}</div>
                  <div style={PS.roleSub}>Menu access permissions</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={PS.countBadge}>
                  <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{checkedCount}</span>
                  <span style={{ color: 'var(--text-3)' }}>/{totalCount} menus</span>
                </div>
                <button style={PS.closeBtn} onClick={() => setModal(null)}>✕</button>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ height: 3, background: 'var(--border)' }}>
              <div style={{ height: '100%', width: `${totalCount ? (checkedCount / totalCount) * 100 : 0}%`, background: 'var(--primary)', transition: 'width .3s', borderRadius: 2 }} />
            </div>

            {/* Toolbar */}
            <div style={PS.toolbar}>
              <input
                style={PS.search}
                placeholder="🔍  Search menus…"
                value={searchMenu}
                onChange={e => setSearchMenu(e.target.value)}
              />
              <button style={{ ...PS.toolBtn, color: 'var(--primary)' }} onClick={selectAll}>✅ Select All</button>
              <button style={{ ...PS.toolBtn, color: 'var(--error)' }} onClick={deselectAll}>☐ Clear All</button>
            </div>

            {/* Menu list */}
            <div style={PS.list}>
              {permLoading ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>Loading menus…
                </div>
              ) : filtered.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>No menus found</div>
              ) : (
                filtered.map(menu => {
                  const mapping  = mappings.find(m => m.menu_id === menu.id);
                  const checked  = !!mapping;
                  const isParent = !menu.parentid;
                  const busy     = toggling === menu.id;

                  return (
                    <div key={menu.id}
                      style={{
                        ...PS.menuRow,
                        paddingLeft: 16 + menu.depth * 24,
                        background: checked ? 'var(--primary-light)' : isParent ? 'var(--green-50)' : 'var(--white)',
                        borderLeft: isParent ? '3px solid var(--primary)' : '3px solid transparent',
                        opacity: busy ? .6 : 1,
                      }}
                      onClick={() => !busy && toggleMenu(menu)}
                    >
                      {/* Checkbox */}
                      <div style={{
                        ...PS.checkbox,
                        background: checked ? 'var(--primary)' : 'var(--white)',
                        borderColor: checked ? 'var(--primary)' : 'var(--border)',
                      }}>
                        {busy ? <span style={{ fontSize: 10 }}>…</span>
                          : checked ? <span style={{ color: '#fff', fontSize: 11, fontWeight: 800 }}>✓</span>
                          : null}
                      </div>

                      {/* Menu info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: isParent ? 700 : 500, fontSize: 13, color: checked ? 'var(--primary)' : 'var(--text-1)' }}>
                            {isParent ? '📁' : '📄'} {menu.name}
                          </span>
                          {isParent && (
                            <span style={{ fontSize: 10, background: 'var(--primary-light)', color: 'var(--primary)', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>
                              Group
                            </span>
                          )}
                        </div>
                        {menu.url && (
                          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                            {menu.url}
                          </div>
                        )}
                      </div>

                      {/* Status tag */}
                      {checked && (
                        <span style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600, background: 'rgba(37,99,235,.12)', padding: '2px 8px', borderRadius: 8, flexShrink: 0 }}>
                          Allowed
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div style={PS.footer}>
              <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
                Click a menu row to toggle · Changes save instantly
              </span>
              <button className="btn btn-primary" onClick={() => setModal(null)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Permission panel styles ───────────────────────────────────
const PS = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
    zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  panel: {
    background: 'var(--white)', borderRadius: 16,
    width: '90%', maxWidth: 620, maxHeight: '88vh',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,.22)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '18px 20px', borderBottom: '1px solid var(--border)',
  },
  roleIcon: {
    width: 42, height: 42, borderRadius: 10,
    background: 'var(--primary-light)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontSize: 20,
  },
  roleTitle: { fontWeight: 700, fontSize: 16, color: 'var(--text-1)' },
  roleSub:   { fontSize: 12, color: 'var(--text-3)', marginTop: 2 },
  countBadge: {
    display: 'flex', alignItems: 'center', gap: 4,
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 20, padding: '4px 12px', fontSize: 13,
  },
  closeBtn: {
    width: 30, height: 30, border: '1px solid var(--border)',
    borderRadius: 8, background: 'var(--bg)', cursor: 'pointer', fontSize: 13,
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg)',
  },
  search: {
    flex: 1, padding: '7px 12px', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'var(--font-sans)',
  },
  toolBtn: {
    padding: '6px 12px', border: '1px solid var(--border)',
    borderRadius: 8, background: 'var(--white)', fontSize: 12,
    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
    fontFamily: 'var(--font-sans)',
  },
  list: { flex: 1, overflowY: 'auto' },
  menuRow: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 16px', borderBottom: '1px solid var(--border-light)',
    cursor: 'pointer', transition: 'background .12s', userSelect: 'none',
  },
  checkbox: {
    width: 20, height: 20, borderRadius: 5,
    border: '1.5px solid', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all .15s',
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderTop: '1px solid var(--border)', background: 'var(--bg)',
  },
};
