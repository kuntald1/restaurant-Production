import { useEffect, useState } from 'react';
import { menuAPI } from '../services/api';
import { Spinner } from '../components/UI';
import { useApp } from '../context/useApp';

const TreeNode = ({ node, depth = 0 }) => {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className="tree-node" style={{ marginLeft: depth * 20 }}>
      <div className={`tree-item ${hasChildren ? 'tree-item-parent' : ''}`} onClick={() => hasChildren && setOpen(!open)}>
        {hasChildren ? (
          <span className="tree-toggle">{open ? '▾' : '▸'}</span>
        ) : (
          <span className="tree-leaf">•</span>
        )}
        <span className="tree-label">{node.menuname}</span>
        {hasChildren && <span className="tree-count">{node.children.length}</span>}
        {node.menuurl && <span className="tree-url">{node.menuurl}</span>}
      </div>
      {open && hasChildren && (
        <div className="tree-children">
          {node.children.map(child => <TreeNode key={child.menuid} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
};

export default function MenuTree() {
  const { selectedCompany } = useApp();
  const [tree, setTree] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedCompany) return;
    setLoading(true);
    menuAPI.getByCompany(selectedCompany.company_unique_id)
      .then(setTree).catch(() => setTree([]))
      .finally(() => setLoading(false));
  }, [selectedCompany]);

  if (!selectedCompany) return (
    <div className="page"><div className="empty-state"><div className="empty-icon">🏢</div><h3>No Company Selected</h3></div></div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Menu Tree</h1>
          <p className="page-subtitle">Nested navigation menu for {selectedCompany.name}</p>
        </div>
      </div>
      {loading ? <Spinner /> : (
        <div className="tree-container">
          {tree.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">🌳</div><h3>No Menus Found</h3></div>
          ) : (
            tree.map(node => <TreeNode key={node.menuid} node={node} />)
          )}
        </div>
      )}
    </div>
  );
}
