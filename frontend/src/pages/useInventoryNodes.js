/**
 * useInventoryNodes.js
 * IMPORTANT FIX: Branch node IDs are prefixed with "b_" to avoid
 * collision with inv_node IDs (both used numbers starting from 1).
 *
 * node_id format:
 *   WH/CK nodes: integer  e.g. 1, 2
 *   Branch nodes: string  e.g. "b_1", "b_2", "b_3"
 *
 * When sending to backend, strip "b_" prefix to get company_unique_id.
 */

import { useState, useEffect } from 'react';
import { invNodeAPI } from '../services/api';

const TYPE_ICON = { warehouse: '🏭', cloud_kitchen: '☁️', branch: '🏪' };

// Convert node_id to backend integer value
export function nodeIdToInt(nodeId) {
  if (nodeId === '' || nodeId === null || nodeId === undefined) return null;
  const s = String(nodeId);
  return s.startsWith('b_') ? parseInt(s.slice(2)) : parseInt(s);
}

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

      // ── Warehouse & Cloud Kitchen — keep integer node_id ─────
      const whAndCk = (whResult.status === 'fulfilled' ? whResult.value || [] : [])
        .filter(n => n.node_type !== 'branch')
        .map(n => ({
          node_id:    n.node_id,                // integer: 1, 2
          node_name:  n.node_name,
          node_icon:  TYPE_ICON[n.node_type] || '📍',
          node_label: `${TYPE_ICON[n.node_type] || '📍'} ${n.node_name}`,
          node_type:  n.node_type,
          is_branch:  false,
          depth:      0,
        }));

      // ── Branches — prefix with "b_" to avoid ID collision ────
      const raw    = branchResult.status === 'fulfilled' ? branchResult.value || [] : [];
      const cidNum = Number(cid);

      const orderedBranches = [];
      const added = new Set();

      // Self (logged-in company) — depth 1
      const selfCompany = raw.find(b => Number(b.company_unique_id) === cidNum);
      if (selfCompany) {
        orderedBranches.push({
          node_id:    `b_${selfCompany.company_unique_id}`,  // "b_1"
          node_name:  selfCompany.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `${TYPE_ICON.branch} ${selfCompany.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      1,
        });
        added.add(selfCompany.company_unique_id);
      }

      // Direct children — depth 2
      const directChildren = raw.filter(b =>
        Number(b.parant_company_unique_id) === cidNum &&
        Number(b.company_unique_id) !== cidNum
      );

      for (const child of directChildren) {
        if (added.has(child.company_unique_id)) continue;
        orderedBranches.push({
          node_id:    `b_${child.company_unique_id}`,  // "b_2", "b_3"
          node_name:  child.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `　↳ ${child.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      2,
        });
        added.add(child.company_unique_id);

        // Grandchildren — depth 3
        const grandkids = raw.filter(b =>
          Number(b.parant_company_unique_id) === Number(child.company_unique_id)
        );
        for (const gk of grandkids) {
          if (added.has(gk.company_unique_id)) continue;
          orderedBranches.push({
            node_id:    `b_${gk.company_unique_id}`,
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

      setNodes([...whAndCk, ...orderedBranches]);
    }).finally(() => setLoadingNodes(false));
  }, [cid]);

  // Display with icon for table cells
  const getNodeDisplay = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    if (!n) return '—';
    const indent = n.depth === 2 ? '↳ ' : n.depth === 3 ? '　↳ ' : '';
    return `${n.node_icon} ${indent}${n.node_name}`;
  };

  const getNodeName = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    return n ? n.node_name : '—';
  };

  const getNodeType = (nodeId) => {
    return nodes.find(n => String(n.node_id) === String(nodeId))?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeDisplay, getNodeType };
}
