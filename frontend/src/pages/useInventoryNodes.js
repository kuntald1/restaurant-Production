/**
 * useInventoryNodes.js
 * Shared hook used by all inventory pages that need node/location dropdowns.
 *
 * LOGIC:
 *   - Warehouses and Cloud Kitchens → from inv_node table (node_type != 'branch')
 *   - Branches → from company table where parant_company_unique_id = cid
 *
 * Returns a unified `nodes` array where each item has:
 *   { node_id, node_name, node_type, is_branch_company, company_unique_id }
 *
 * For branch companies, node_id is prefixed with "c_" (e.g. "c_2", "c_3")
 * so they don't clash with inv_node IDs.
 * The backend stock balance uses integer node_id — branch companies
 * use their company_unique_id as node_id in inv_stock_balance.
 */

import { useState, useEffect } from 'react';
import { invNodeAPI } from '../services/api';

export function useInventoryNodes(cid) {
  const [nodes,   setNodes]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cid) { setNodes([]); return; }
    setLoading(true);

    Promise.allSettled([
      invNodeAPI.getAll(cid),
      invNodeAPI.getBranches(cid),
    ]).then(([whResult, branchResult]) => {
      // WH + Cloud Kitchen nodes (exclude old branch-type nodes from inv_node)
      const whAndCk = (whResult.status === 'fulfilled' ? whResult.value || [] : [])
        .filter(n => n.node_type !== 'branch');

      // Branch companies from company table
      const branchCompanies = (branchResult.status === 'fulfilled' ? branchResult.value || [] : [])
        .map(b => ({
          node_id:            b.company_unique_id,   // use company_unique_id as node_id
          node_name:          b.name,
          node_type:          'branch',
          address:            b.address || '',
          is_branch_company:  true,
          company_unique_id:  b.company_unique_id,
          is_active:          true,
        }));

      setNodes([...whAndCk, ...branchCompanies]);
    }).finally(() => setLoading(false));
  }, [cid]);

  return { nodes, loadingNodes: loading };
}
