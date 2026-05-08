/**
 * useInventoryNodes.js
 * Shared hook for all inventory pages that need location dropdowns.
 *
 * LOGIC:
 *   Warehouses & Cloud Kitchens → inv_node table (node_type != 'branch')
 *   Branches                    → company table (parant_company_unique_id = cid)
 *                                 shown in parent→child tree order
 *
 * DROPDOWN FORMAT (nodes array):
 *   Each entry has:
 *     node_id       — number (inv_node.node_id or company.company_unique_id)
 *     node_name     — display name (indented for child branches)
 *     node_type     — 'warehouse' | 'cloud_kitchen' | 'branch'
 *     is_branch     — true if from company table
 *     depth         — 0=top, 1=child, 2=grandchild (for indent)
 *
 * USAGE in any page:
 *   const { nodes, loadingNodes, getNodeName, getNodeType } = useInventoryNodes(cid);
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
          node_id:   n.node_id,
          node_name: `${TYPE_ICON[n.node_type] || '📍'} ${n.node_name}`,
          node_type: n.node_type,
          is_branch: false,
          depth:     0,
        }));

      // ── Branches from company table (parent-child tree) ───────
      const raw = branchResult.status === 'fulfilled' ? branchResult.value || [] : [];

      // Direct children of logged-in company (depth=1)
      const directChildren = raw.filter(b => b.parant_company_unique_id === cid);
      // Grandchildren (depth=2)
      const directChildIds = new Set(directChildren.map(b => b.company_unique_id));
      const grandChildren  = raw.filter(b => directChildIds.has(b.parant_company_unique_id));

      // Build ordered flat list: each parent followed by its children
      const orderedBranches = [];
      for (const parent of directChildren) {
        orderedBranches.push({
          node_id:   parent.company_unique_id,
          node_name: `${TYPE_ICON.branch} ${parent.name}`,
          node_type: 'branch',
          is_branch: true,
          depth:     1,
        });
        const children = grandChildren.filter(g => g.parant_company_unique_id === parent.company_unique_id);
        for (const child of children) {
          orderedBranches.push({
            node_id:   child.company_unique_id,
            node_name: `\u3000\u21b3 ${child.name}`,  // indented with unicode
            node_type: 'branch',
            is_branch: true,
            depth:     2,
          });
        }
      }

      setNodes([...whAndCk, ...orderedBranches]);
    }).finally(() => setLoadingNodes(false));
  }, [cid]);

  // Get clean display name (no icons/indent) for table cells
  const getNodeName = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    if (!n) return '—';
    return n.node_name
      .replace(/^[🏭☁️🏪📍]\s*/, '')
      .replace(/^\u3000\u21b3\s*/, '');
  };

  const getNodeType = (nodeId) => {
    return nodes.find(n => String(n.node_id) === String(nodeId))?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeType };
}
