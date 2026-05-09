/**
 * useInventoryNodes.js
 * Shared hook for all inventory pages that need location dropdowns.
 *
 * node_name  = plain text name (no emoji)
 * node_icon  = emoji icon
 * node_label = what shows in <option> dropdown (emoji + indent + name)
 * getNodeDisplay(id) = icon + name for table cells
 */

import { useState, useEffect } from 'react';
import { invNodeAPI } from '../services/api';

const TYPE_ICON = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };

export function useInventoryNodes(cid) {
  const [nodes,        setNodes]        = useState([]);
  const [loadingNodes, setLoadingNodes] = useState(false);

  useEffect(() => {
    if (!cid) { setNodes([]); return; }
    setLoadingNodes(true);

    Promise.allSettled([
      invNodeAPI.getAll(cid),
      invNodeAPI.getBranches(cid),
    ]).then(([whResult, branchResult]) => {

      // ── Warehouse & Cloud Kitchen from inv_node ──────────────
      const whAndCk = (whResult.status === 'fulfilled' ? whResult.value || [] : [])
        .filter(n => n.node_type !== 'branch')
        .map(n => ({
          node_id:    n.node_id,
          node_name:  n.node_name,
          node_icon:  TYPE_ICON[n.node_type] || '📍',
          node_label: `${TYPE_ICON[n.node_type] || '📍'} ${n.node_name}`,
          node_type:  n.node_type,
          is_branch:  false,
          depth:      0,
        }));

      // ── Branches from company table ──────────────────────────
      const raw    = branchResult.status === 'fulfilled' ? branchResult.value || [] : [];
      const cidNum = parseInt(cid);

      const topLevel       = raw.filter(b => b.company_unique_id === cidNum || b.parant_company_unique_id === null);
      const directChildren = raw.filter(b => b.parant_company_unique_id === cidNum && b.company_unique_id !== cidNum);
      const directChildIds = new Set(directChildren.map(b => b.company_unique_id));
      const grandChildren  = raw.filter(b => directChildIds.has(b.parant_company_unique_id));

      const orderedBranches = [];
      const added = new Set();

      for (const top of topLevel) {
        if (added.has(top.company_unique_id)) continue;
        orderedBranches.push({
          node_id:    top.company_unique_id,
          node_name:  top.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `${TYPE_ICON.branch} ${top.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      1,
        });
        added.add(top.company_unique_id);

        const children = directChildren.filter(d => d.parant_company_unique_id === top.company_unique_id);
        for (const child of children) {
          if (added.has(child.company_unique_id)) continue;
          orderedBranches.push({
            node_id:    child.company_unique_id,
            node_name:  child.name,
            node_icon:  TYPE_ICON.branch,
            node_label: `　↳ ${child.name}`,
            node_type:  'branch',
            is_branch:  true,
            depth:      2,
          });
          added.add(child.company_unique_id);

          const grandkids = grandChildren.filter(g => g.parant_company_unique_id === child.company_unique_id);
          for (const gk of grandkids) {
            if (added.has(gk.company_unique_id)) continue;
            orderedBranches.push({
              node_id:    gk.company_unique_id,
              node_name:  gk.name,
              node_icon:  TYPE_ICON.branch,
              node_label: `　　↳ ${gk.name}`,
              node_type:  'branch',
              is_branch:  true,
              depth:      3,
            });
            added.add(gk.company_unique_id);
          }
        }
      }

      // Add any remaining direct children
      for (const child of directChildren) {
        if (added.has(child.company_unique_id)) continue;
        orderedBranches.push({
          node_id:    child.company_unique_id,
          node_name:  child.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `　↳ ${child.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      2,
        });
        added.add(child.company_unique_id);
      }

      setNodes([...whAndCk, ...orderedBranches]);
    }).finally(() => setLoadingNodes(false));
  }, [cid]);

  // Plain name for table cells
  const getNodeName = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    return n ? n.node_name : '—';
  };

  // Icon + indent + name for table cells
  const getNodeDisplay = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    if (!n) return '—';
    const indent = n.depth === 2 ? '↳ ' : n.depth === 3 ? '　↳ ' : '';
    return `${n.node_icon} ${indent}${n.node_name}`;
  };

  const getNodeType = (nodeId) => {
    return nodes.find(n => String(n.node_id) === String(nodeId))?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeDisplay, getNodeType };
}
