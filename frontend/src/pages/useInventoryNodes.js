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

export function useInventoryNodes(cid, selectedCompany, allCompanies) {
  const [nodes,        setNodes]        = useState([]);
  const [loadingNodes, setLoadingNodes] = useState(false);

  useEffect(() => {
    if (!cid) { setNodes([]); return; }
    // Wait for allCompanies to load before proceeding
    // This prevents wrong rootCid calculation on first render
    setLoadingNodes(true);

    // Find root (top-level) company — walk up the tree until no parent
    const allCo = allCompanies || [];
    const myCo  = allCo.find(c => Number(c.company_unique_id) === Number(cid));
    // Direct parent
    const myParentId = myCo?.parant_company_unique_id
                    || selectedCompany?.parant_company_unique_id
                    || null;
    // Walk up to find true root (grandparent check)
    let rootId = myParentId;
    if (rootId) {
      const parentCo = allCo.find(c => Number(c.company_unique_id) === Number(rootId));
      if (parentCo?.parant_company_unique_id) {
        rootId = parentCo.parant_company_unique_id; // go one more level up
      }
    }
    const parentCid = myParentId || cid;  // WH/CK from direct parent
    const rootCid   = rootId || cid;      // branches from root company

    // Always fetch branches from BOTH self and parent to ensure complete list
    const branchCid = rootCid !== cid ? rootCid : cid;

    Promise.allSettled([
      invNodeAPI.getAll(parentCid),          // WH/CK from parent (or self)
      invNodeAPI.getBranches(branchCid),     // branches from root company
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

      // rootCidNum = the top-level parent company (whose nodes/branches we loaded)
      const rootCidNum = Number(rootCid);

      // Build branch tree from root company perspective
      // Find root company itself
      const rootCompany = raw.find(b => Number(b.company_unique_id) === rootCidNum);
      if (rootCompany) {
        orderedBranches.push({
          node_id:    `b_${rootCompany.company_unique_id}`,
          node_name:  rootCompany.name,
          node_icon:  TYPE_ICON.branch,
          node_label: `${TYPE_ICON.branch} ${rootCompany.name}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      1,
        });
        added.add(rootCompany.company_unique_id);
      }

      // Always ensure logged-in company (cid) is in the list
      if (!added.has(cidNum)) {
        const selfName = selectedCompany?.name || `Branch #${cid}`;
        orderedBranches.push({
          node_id:    `b_${cidNum}`,
          node_name:  selfName,
          node_icon:  TYPE_ICON.branch,
          node_label: `${TYPE_ICON.branch} ${selfName}`,
          node_type:  'branch',
          is_branch:  true,
          depth:      1,
        });
        added.add(cidNum);
      }

      // Direct children of root — depth 2
      const directChildren = raw.filter(b =>
        Number(b.parant_company_unique_id) === rootCidNum &&
        Number(b.company_unique_id) !== rootCidNum
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
  }, [cid, allCompanies?.length]);

  // Find node by ID — handles both "b_3" (form) and 3 (from DB)
  const findNode = (nodeId) => {
    if (nodeId === null || nodeId === undefined || nodeId === '') return null;
    const s = String(nodeId);
    // Try exact match first
    let n = nodes.find(n => String(n.node_id) === s);
    if (n) return n;
    // Try matching integer value (DB stores 3, node has "b_3")
    const num = s.startsWith('b_') ? s.slice(2) : s;
    n = nodes.find(n => {
      const nid = String(n.node_id);
      const nnum = nid.startsWith('b_') ? nid.slice(2) : nid;
      return nnum === num;
    });
    return n || null;
  };

  // Display with icon for table cells
  // allNodeNames: pass a global lookup map if available
  const getNodeDisplay = (nodeId, globalLookup) => {
    const n = findNode(nodeId);
    if (n) {
      const indent = n.depth === 2 ? '↳ ' : n.depth === 3 ? '　↳ ' : '';
      return `${n.node_icon} ${indent}${n.node_name}`;
    }
    // Fallback: check globalLookup (cross-company nodes)
    if (globalLookup && globalLookup[String(nodeId)]) {
      return globalLookup[String(nodeId)];
    }
    return nodeId ? `Node #${nodeId}` : '—';
  };

  const getNodeName = (nodeId) => {
    const n = findNode(nodeId);
    return n ? n.node_name : '—';
  };

  const getNodeType = (nodeId) => {
    return findNode(nodeId)?.node_type || '';
  };

  return { nodes, loadingNodes, getNodeName, getNodeDisplay, getNodeType };
}
