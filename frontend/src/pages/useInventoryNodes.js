/**
 * useInventoryNodes.js — Fixed version
 * Fixes:
 *   1. Company 1 (Main Branch) now shows in dropdown
 *   2. node_label uses proper indent for children
 *   3. Same node cannot be selected for From and To (handled in component)
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

      // ── Warehouse & Cloud Kitchen ────────────────────────────
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
      const cidNum = Number(cid);

      // Build ordered list with parent-child hierarchy
      // Strategy: find the "root" company (cid itself) and its children
      const orderedBranches = [];
      const added = new Set();

      // Find the logged-in company in the raw list
      const selfCompany = raw.find(b => Number(b.company_unique_id) === cidNum);

      // Add self first (depth 1 — top level branch)
      if (selfCompany) {
        orderedBranches.push({
          node_id:    selfCompany.company_unique_id,
          node_name:  selfCompany.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `${TYPE_ICON.branch} ${selfCompany.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      1,
        });
        added.add(selfCompany.company_unique_id);
      }

      // Add direct children of cid (depth 2)
      const directChildren = raw.filter(b =>
        Number(b.parant_company_unique_id) === cidNum &&
        Number(b.company_unique_id) !== cidNum
      );

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

        // Add grandchildren (depth 3)
        const grandkids = raw.filter(b =>
          Number(b.parant_company_unique_id) === Number(child.company_unique_id)
        );
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

      setNodes([...whAndCk, ...orderedBranches]);
    }).finally(() => setLoadingNodes(false));
  }, [cid]);

  // Icon + name for table display
  const getNodeDisplay = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    if (!n) return '—';
    const indent = n.depth === 2 ? '↳ ' : n.depth === 3 ? '　↳ ' : '';
    return `${n.node_icon} ${indent}${n.node_name}`;
  };

  // Plain name only
  const getNodeName = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    return n ? n.node_name : '—';
  };

  const getNodeType = (nodeId) => {
    return nodes.find(n => String(n.node_id) === String(nodeId))?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeDisplay, getNodeType };
}
