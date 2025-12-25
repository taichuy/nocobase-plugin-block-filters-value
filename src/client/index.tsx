/**
 * This file is part of the NocoBase (R) project.
 * Copyright (c) 2020-2024 NocoBase Co., Ltd.
 * Authors: NocoBase Team.
 *
 * This project is dual-licensed under AGPL-3.0 and NocoBase Commercial License.
 * For more information, please refer to: https://www.nocobase.com/agreement.
 */

import { Plugin, getStoredPopupContext } from '@nocobase/client';

export class PluginBlockDefaultValueClient extends Plugin {
  async afterAdd() {
    // await this.app.pm.add()
  }

  async beforeLoad() {}

  // You can get and modify the app instance here
  async load() {
    console.log('[TDCK DefaultValue] register $tdckParentObject');
    const app = this.app;
    const api = app.apiClient;
    const TDCK_PARENT_CACHE = new Map<string, any>();
    const TDCK_PARENT_SIG = new Map<string, string>();
    const TDCK_LOGGED_SIG = new Set<string>();
    const TDCK_CHILDREN_CACHE = new Map<string, { sig: string; children: any }>();
    const TDCK_OPTION_CACHE = new Map<string, any>();
    const TDCK_LINKAGE_CACHE = new Map<string, any>();
    const TDCK_LINKAGE_SIG = new Map<string, string>();
    const resolveTdckParentCtx = async (params?: { variableName?: string }) => {
      const searchParams = new URLSearchParams(window.location.search || '');
      const urlTargetId = searchParams.get('targetId') || searchParams.get('parentId') || searchParams.get('id');
      const popupUid = getLastPopupUidFromPath(window.location.pathname || '');
      const cacheKey = popupUid || (urlTargetId ? 'url:' + urlTargetId : 'default');
      const stored = popupUid ? getStoredPopupContext(popupUid) : null;
      const tableCtx = stored?.tableBlockContext;
      if (!stored || !tableCtx || !stored.dataSource) {
        TDCK_PARENT_CACHE.delete(cacheKey);
        TDCK_PARENT_SIG.delete(cacheKey);
        return null;
      }
      const selectedRowData = tableCtx?.field?.data?.selectedRowData || [];
      const filters = stored?.service?.params?.[1]?.filters || {};
      const extracted = extractIdsFromLinkageFilters(filters);
      const rowKey = tableCtx?.rowKey || 'id';
      const selectionId = Array.isArray(selectedRowData) && selectedRowData[0] ? selectedRowData[0][rowKey] : null;
      const filterIds = extracted?.ids || [];
      const resolvedId = urlTargetId
        ? isNaN(Number(urlTargetId))
          ? urlTargetId
          : Number(urlTargetId)
        : selectionId != null
          ? selectionId
          : filterIds[0] ?? null;
      const newSig = `${cacheKey}:${filterIds.length ? `ids:${filterIds.join(',')}` : resolvedId ?? 'null'}`;
      const prevSig = TDCK_PARENT_SIG.get(cacheKey);
      if (prevSig === newSig && TDCK_PARENT_CACHE.has(cacheKey)) {
        const base = TDCK_PARENT_CACHE.get(cacheKey);
        return applyPathOnBase(params?.variableName, base);
      }
      if (!TDCK_LOGGED_SIG.has(newSig)) {
        console.log('[TDCK DefaultValue] url params', { urlTargetId });
        console.log('[TDCK DefaultValue] popup context', {
          popupUid,
          dataSource: stored?.dataSource,
          collection: tableCtx?.collection,
          rowKey,
          selectedRowKeys: tableCtx?.field?.data?.selectedRowKeys || [],
          selectedRowData,
        });
        console.log('[TDCK DefaultValue] filters/extracted', { filters, extracted });
        TDCK_LOGGED_SIG.add(newSig);
      }
      TDCK_PARENT_SIG.set(cacheKey, newSig);
      if (resolvedId == null) {
        TDCK_PARENT_CACHE.set(cacheKey, null);
        TDCK_PARENT_SIG.set(cacheKey, newSig);
        return applyPathOnBase(params?.variableName, null);
      }
      if (filterIds.length) {
        try {
          const fieldName = extracted.fieldName;
          const cm = app.getCollectionManager(stored?.dataSource);
          const currentCollectionName = tableCtx?.collection;
          if (!fieldName || !currentCollectionName) {
            const isMany = false;
            if (filterIds.length > 1 || isMany) {
              const arr = Object.freeze(filterIds.map((id) => Object.freeze({ id })));
              TDCK_PARENT_CACHE.set(cacheKey, arr);
              return arr;
            }
            const obj = Object.freeze({ id: filterIds[0] });
            TDCK_PARENT_CACHE.set(cacheKey, obj);
            return obj;
          }
          const collectionField = cm?.getCollection(currentCollectionName)?.getField(fieldName);
          const target = collectionField?.target;
          const cmTarget = target ? cm?.getCollection(target) : null;
          console.log('[TDCK DefaultValue] target resolve', { currentCollectionName, fieldName, target });
          if (target && cmTarget) {
            const isMany = collectionField?.type === 'belongsToMany';
            if (isMany) {
              const targetKey = collectionField?.targetKey || 'id';
              const res = await api.resource(target).list({
                filter: { [targetKey]: { $in: filterIds } },
                pageSize: filterIds.length,
              });
              const list = Array.isArray(res?.data?.data) ? res.data.data : [];
              const arr = Object.freeze(list.map((item) => Object.freeze(item)));
              TDCK_PARENT_CACHE.set(cacheKey, arr);
              return applyPathOnBase(params?.variableName, arr);
            } else {
              const res = await api.resource(target).get({ filterByTk: filterIds[0] });
              const obj = res?.data?.data || Object.freeze({ id: filterIds[0] });
              TDCK_PARENT_CACHE.set(cacheKey, obj);
              return applyPathOnBase(params?.variableName, obj);
            }
          }
          console.log('[TDCK DefaultValue] fallback parent ids', filterIds);
          const isMany = filterIds.length > 1;
          if (isMany) {
            const arr = Object.freeze(filterIds.map((id) => Object.freeze({ id })));
            TDCK_PARENT_CACHE.set(cacheKey, arr);
            return applyPathOnBase(params?.variableName, arr);
          }
          const obj = Object.freeze({ id: filterIds[0] });
          TDCK_PARENT_CACHE.set(cacheKey, obj);
          return applyPathOnBase(params?.variableName, obj);
        } catch {
          console.log('[TDCK DefaultValue] error, fallback parent ids', filterIds);
          const isMany = filterIds.length > 1;
          if (isMany) {
            const arr = Object.freeze(filterIds.map((id) => Object.freeze({ id })));
            TDCK_PARENT_CACHE.set(cacheKey, arr);
            return applyPathOnBase(params?.variableName, arr);
          }
          const obj = Object.freeze({ id: filterIds[0] });
          TDCK_PARENT_CACHE.set(cacheKey, obj);
          return applyPathOnBase(params?.variableName, obj);
        }
      }
      if (urlTargetId) {
        const obj = Object.freeze({ id: resolvedId });
        TDCK_PARENT_CACHE.set(cacheKey, obj);
        return applyPathOnBase(params?.variableName, obj);
      }
      if (selectionId != null && Array.isArray(selectedRowData) && selectedRowData.length > 0) {
        const obj = selectedRowData[0];
        TDCK_PARENT_CACHE.set(cacheKey, obj);
        return applyPathOnBase(params?.variableName, obj);
      }
      return applyPathOnBase(params?.variableName, null);
    };
    this.app.registerVariable({
      name: '$tdckParentObject',
      useOption: () => {
        const popupUid = getLastPopupUidFromPath(window.location.pathname || '');
        const stored = popupUid ? getStoredPopupContext(popupUid) : null;
        const dataSource = stored?.dataSource;
        const cm = app.getCollectionManager(dataSource);
        try {
          const filters = stored?.service?.params?.[1]?.filters || {};
          const extracted = extractIdsFromLinkageFilters(filters);
          const currentCollectionName = stored?.tableBlockContext?.collection;
          const fieldName = extracted?.fieldName;
          const collectionField =
            fieldName && currentCollectionName ? cm?.getCollection(currentCollectionName)?.getField(fieldName) : null;
          const target = collectionField?.target;
          const key = `${dataSource || 'ds'}:${target || 'none'}`;
          if (target && cm?.getCollection(target)) {
            const collection = cm.getCollection(target);
            const fields = collection?.getAllFields?.() || collection?.getFields?.() || [];
            const sig = (fields || [])
              .filter((f: any) => !!f?.interface)
              .map((f: any) => `${f.name}:${f?.target || ''}:${f?.interface || ''}`)
              .join('|');
            const cachedChildren = TDCK_CHILDREN_CACHE.get(key);
            let children = cachedChildren && cachedChildren.sig === sig ? cachedChildren.children : undefined;
            if (!children) {
              const built = buildFieldChildren(app, cm, target, 0, 2);
              children = Array.isArray(built) ? Object.freeze(built.map(freezeOptionItem)) : undefined;
              TDCK_CHILDREN_CACHE.set(key, { sig, children });
            }
            const optKey = `opt:${key}`;
            const prevOpt = TDCK_OPTION_CACHE.get(optKey);
            const optionObj =
              prevOpt && prevOpt.children === children
                ? prevOpt
                : Object.freeze({ value: '$tdckParentObject', label: '父筛选区块记录值', children });
            if (optionObj !== prevOpt) TDCK_OPTION_CACHE.set(optKey, optionObj);
            return { option: optionObj, visible: true };
          }
          const optKey = `opt:${key}`;
          const prevOpt = TDCK_OPTION_CACHE.get(optKey);
          const optionObj = prevOpt || Object.freeze({ value: '$tdckParentObject', label: '父筛选区块记录值' });
          if (!prevOpt) TDCK_OPTION_CACHE.set(optKey, optionObj);
          return { option: optionObj, visible: true };
        } catch {
          const optKey = 'opt:error';
          const prevOpt = TDCK_OPTION_CACHE.get(optKey);
          const optionObj = prevOpt || Object.freeze({ value: '$tdckParentObject', label: '记录父级应该是一个对象' });
          if (!prevOpt) TDCK_OPTION_CACHE.set(optKey, optionObj);
          return { option: optionObj, visible: true };
        }
      },
      useCtx: () => resolveTdckParentCtx,
    });
    // $tdckLinkageFilters 变量标签已移除
    // logger removed to avoid render issues
  }
}

function extractIdsFromLinkageFilters(filters: Record<string, any>): { fieldName: string; ids: any[] } | null {
  try {
    const groups = Object.values(filters || {});
    for (const g of groups) {
      const list = g?.$and || g?.$or || [];
      for (const cond of list) {
        const key = Object.keys(cond || {})[0];
        const expr = key ? cond[key] : null;
        if (key && /\.id$/.test(key) && expr?.$in && Array.isArray(expr.$in)) {
          const fieldName = key.replace(/\.id$/, '');
          return { fieldName, ids: expr.$in };
        }
      }
    }
  } catch (e) {
    console.warn('[TDCK LinkageFilters] extract error', e);
  }
  return null;
}

function getLastPopupUidFromPath(path: string): string | null {
  try {
    const idx = path.lastIndexOf('/popups/');
    if (idx === -1) return null;
    const rest = path.substring(idx + '/popups/'.length);
    const seg = rest.split('/')[0];
    return seg || null;
  } catch {
    return null;
  }
}

function buildFieldChildren(app: any, cm: any, collectionName: string, depth: number, maxDepth: number) {
  try {
    const collection = cm?.getCollection(collectionName);
    const fields = collection?.getAllFields?.() || collection?.getFields?.() || [];
    return (fields || [])
      .filter((f: any) => !!f?.interface)
      .map((f: any) => {
        const item: any = {
          key: f.name,
          value: f.name,
          label: resolveTitle(app, f?.uiSchema?.title) || f.name,
          isLeaf: true,
        };
        if (f?.target && depth < maxDepth) {
          item.children = buildFieldChildren(app, cm, f.target, depth + 1, maxDepth);
        }
        return item;
      })
      .filter(Boolean);
  } catch {
    return undefined;
  }
}

function freezeOptionItem(item: any): any {
  const children = Array.isArray(item.children) ? Object.freeze(item.children.map(freezeOptionItem)) : undefined;
  return Object.freeze({ key: item.key, value: item.value, label: item.label, isLeaf: item.isLeaf, children });
}

function resolveTitle(app: any, title: any): any {
  try {
    if (typeof title === 'string') {
      const m = title.match(/\{\{\s*t\((['"])?(.*?)\1\)\s*\}\}/);
      if (m && m[2]) return app?.i18n?.t?.(m[2]) ?? m[2];
      return title;
    }
    return title;
  } catch {
    return title;
  }
}

export default PluginBlockDefaultValueClient;

function applyPathOnBase(variablePath?: string, base?: any) {
  try {
    if (!variablePath) return base;
    const parts = variablePath.split('.');
    if (!parts.length) return base;
    parts.shift();
    if (!parts.length) return base;
    const segPath = parts.join('.');
    if (base == null) return base;
    if (Array.isArray(base)) {
      const arr = base.map((item) => getValueByDotPath(item, segPath));
      return Object.freeze(arr);
    }
    return getValueByDotPath(base, segPath);
  } catch {
    return base;
  }
}

function getValueByDotPath(obj: any, path: string) {
  try {
    if (!obj || !path) return obj;
    const parts = path.split('.');
    let cur = obj;
    for (const k of parts) {
      if (cur == null) return cur;
      cur = cur?.[k];
    }
    return cur;
  } catch {
    return obj;
  }
}
