/**
 * useInventoryNodes.js
 * Shared hook for all inventory pages that need location dropdowns.
 *
 * LOGIC:
 *   Warehouses & Cloud Kitchens → inv_node table (node_type != 'branch')
 *   Branches                    → company table via /inventory/branches/{cid}
 *                                 API returns: logged-in company + children + grandchildren
 *                                 Frontend builds parent-child tree for dropdown display
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

      // Warehouse & Cloud Kitchen from inv_node
      const whAndCk = (whResult.status === 'fulfilled' ? whResult.value || [] : [])
        .filter(n => n.node_type !== 'branch')
        .map(n => ({
          node_id:   n.node_id,
          node_name: `${TYPE_ICON[n.node_type] || '📍'} ${n.node_name}`,
          node_type: n.node_type,
          is_branch: false,
          depth:     0,
        }));

      // Branches from company table
      const raw    = branchResult.status === 'fulfilled' ? branchResult.value || [] : [];
      const cidNum = parseInt(cid);

      // The logged-in company itself (parant = null or parant not in list)
      const topLevel = raw.filter(b =>
        b.company_unique_id === cidNum ||
        b.parant_company_unique_id === null
      );

      // Direct children of cid
      const directChildren = raw.filter(b =>
        b.parant_company_unique_id === cidNum &&
        b.company_unique_id !== cidNum
      );

      // Grandchildren
      const directChildIds = new Set(directChildren.map(b => b.company_unique_id));
      const grandChildren  = raw.filter(b => directChildIds.has(b.parant_company_unique_id));

      // Build ordered flat list
      const orderedBranches = [];
      const added = new Set();

      for (const top of topLevel) {
        if (added.has(top.company_unique_id)) continue;
        orderedBranches.push({
          node_id:   top.company_unique_id,
          node_name: `${TYPE_ICON.branch} ${top.name}`,
          node_type: 'branch',
          is_branch: true,
          depth:     1,
        });
        added.add(top.company_unique_id);

        // Children of this top-level
        const children = directChildren.filter(d =>
          d.parant_company_unique_id === top.company_unique_id
        );
        for (const child of children) {
          if (added.has(child.company_unique_id)) continue;
          orderedBranches.push({
            node_id:   child.company_unique_id,
            node_name: `\u3000\u21b3 ${child.name}`,
            node_type: 'branch',
            is_branch: true,
            depth:     2,
          });
          added.add(child.company_unique_id);

          // Grandchildren
          const grandkids = grandChildren.filter(g =>
            g.parant_company_unique_id === child.company_unique_id
          );
          for (const gk of grandkids) {
            if (added.has(gk.company_unique_id)) continue;
            orderedBranches.push({
              node_id:   gk.company_unique_id,
              node_name: `\u3000\u3000\u21b3 ${gk.name}`,
              node_type: 'branch',
              is_branch: true,
              depth:     3,
            });
            added.add(gk.company_unique_id);
          }
        }
      }

      // Add any remaining direct children not yet added
      for (const child of directChildren) {
        if (added.has(child.company_unique_id)) continue;
        orderedBranches.push({
          node_id:   child.company_unique_id,
          node_name: `\u3000\u21b3 ${child.name}`,
          node_type: 'branch',
          is_branch: true,
          depth:     2,
        });
        added.add(child.company_unique_id);
      }

      setNodes([...whAndCk, ...orderedBranches]);
    }).finally(() => setLoadingNodes(false));
  }, [cid]);

  // Clean display name for table cells (no icons/indent)
  const getNodeName = (nodeId) => {
    const n = nodes.find(n => String(n.node_id) === String(nodeId));
    if (!n) return '—';
    return n.node_name
      .replace(/^[🏭☁️🏪📍]\s*/, '')
      .replace(/^\u3000+\u21b3\s*/, '');
  };

  const getNodeType = (nodeId) => {
    return nodes.find(n => String(n.node_id) === String(nodeId))?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeType };
}
