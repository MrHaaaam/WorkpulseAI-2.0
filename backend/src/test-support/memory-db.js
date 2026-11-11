import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const clone = value => structuredClone(value);
function valuesAt(value, parts) {
  if (!parts.length) return [value];
  if (Array.isArray(value)) return value.flatMap(item => valuesAt(item, parts));
  return valuesAt(value?.[parts[0]], parts.slice(1));
}
const equal = (a, b) => b === null ? a == null : Array.isArray(a) && !Array.isArray(b) ? a.some(item => equal(item, b)) : isDeepStrictEqual(a, b);
function condition(value, query) {
  if (query instanceof RegExp) return query.test(String(value ?? ''));
  if (!query || typeof query !== 'object' || query instanceof Date || Array.isArray(query)) return equal(value, query);
  return Object.entries(query).every(([op, target]) => {
    switch (op) {
      case '$eq': return equal(value, target);
      case '$ne': return !equal(value, target);
      case '$exists': return (value !== undefined) === target;
      case '$in': return target.some(item => equal(value, item));
      case '$nin': return !target.some(item => equal(value, item));
      case '$gt': return value > target;
      case '$gte': return value >= target;
      case '$lt': return value < target;
      case '$lte': return value <= target;
      case '$elemMatch': return Array.isArray(value) && value.some(item => matches(item, target));
      case '$not': return !condition(value, target);
      default: if (op.startsWith('$')) throw new Error(`Unsupported test query ${op}`); return equal(value, query);
    }
  });
}
export function matches(row, query = {}) {
  return Object.entries(query).every(([key, value]) => {
    if (key === '$or') return value.some(filter => matches(row, filter));
    if (key === '$and') return value.every(filter => matches(row, filter));
    return valuesAt(row, key.split('.')).some(actual => condition(actual, value));
  });
}
function assign(row, key, value, remove = false) {
  const parts = key.split('.'); let target = row;
  for (const part of parts.slice(0, -1)) target = target[part] ??= {};
  if (remove) delete target[parts.at(-1)]; else target[parts.at(-1)] = clone(value);
}
function update(row, changes, inserted = false) {
  for (const [op, fields] of Object.entries(changes)) for (const [key, value] of Object.entries(fields)) {
    const current = valuesAt(row, key.split('.'))[0];
    switch (op) {
      case '$set': assign(row, key, value); break;
      case '$setOnInsert': if (inserted) assign(row, key, value); break;
      case '$unset': assign(row, key, undefined, true); break;
      case '$inc': assign(row, key, (current || 0) + value); break;
      case '$push': assign(row, key, [...(current || []), ...(value?.$each || [value])]); break;
      case '$addToSet': { const result = [...(current || [])]; for (const item of value?.$each || [value]) if (!result.some(old => equal(old, item))) result.push(item); assign(row, key, result); break; }
      case '$pull': assign(row, key, (current || []).filter(item => !condition(item, value))); break;
      default: throw new Error(`Unsupported test update ${op}`);
    }
  }
}
function projected(row, projection) {
  if (!projection) return clone(row);
  const includes = Object.entries(projection).filter(([key, value]) => key !== '_id' && value);
  if (!includes.length) { const result = clone(row); for (const [key, value] of Object.entries(projection)) if (!value) assign(result, key, undefined, true); return result; }
  const result = projection._id === 0 ? {} : { _id: row._id };
  for (const [key] of includes) {
    const root = key.split('.')[0];
    if (key.includes('.') && Array.isArray(row[root])) { result[root] = clone(row[root]); continue; }
    const value = valuesAt(row, key.split('.'))[0]; if (value !== undefined) assign(result, key, value);
  }
  return result;
}
export function memoryDb() {
  const data = new Map();
  const rows = name => { if (!data.has(name)) data.set(name, []); return data.get(name); };
  const db = { data, reset() { data.clear(); }, collection(name) { return {
    async findOne(filter = {}, options = {}) { const row = rows(name).find(row => matches(row, filter)); return row ? projected(row, options.projection) : null; },
    find(filter = {}, options = {}) {
      let selected = rows(name).filter(row => matches(row, filter));
      const cursor = {
        sort(sort) { selected.sort((a, b) => { for (const [key, direction] of Object.entries(sort)) { const left = valuesAt(a, key.split('.'))[0], right = valuesAt(b, key.split('.'))[0]; if (left < right) return -direction; if (left > right) return direction; } return 0; }); return cursor; },
        limit(limit) { selected = selected.slice(0, limit); return cursor; },
        skip(count) { selected = selected.slice(count); return cursor; },
        async toArray() { return selected.map(row => projected(row, options.projection)); },
        async next() { return selected.length ? projected(selected[0], options.projection) : null; },
      }; return cursor;
    },
    async insertOne(row) { const record = clone({ ...row, _id: row._id ?? crypto.randomUUID() }); rows(name).push(record); return { insertedId: record._id }; },
    async insertMany(records) { for (const row of records) await this.insertOne(row); return { insertedCount: records.length }; },
    async updateOne(filter, changes, options = {}) {
      let row = rows(name).find(row => matches(row, filter)); const inserted = !row && options.upsert;
      if (inserted) { row = { _id: crypto.randomUUID(), ...Object.fromEntries(Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && (value == null || typeof value !== 'object'))) }; rows(name).push(row); }
      if (!row) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      const before = clone(row); update(row, changes, inserted);
      return { matchedCount: inserted ? 0 : 1, modifiedCount: inserted ? 0 : Number(!equal(before, row)), upsertedCount: inserted ? 1 : 0 };
    },
    async updateMany(filter, changes) { const selected = rows(name).filter(row => matches(row, filter)); let count = 0; for (const row of selected) { const before = clone(row); update(row, changes); count += Number(!equal(before, row)); } return { matchedCount: selected.length, modifiedCount: count }; },
    async findOneAndUpdate(filter, changes, options = {}) { const before = await this.findOne(filter); await this.updateOne(filter, changes, options); return options.returnDocument === 'after' ? this.findOne(before ? { _id: before._id } : filter, options) : before; },
    async findOneAndDelete(filter) { const row = await this.findOne(filter); if (row) await this.deleteOne(filter); return row; },
    async deleteOne(filter) { const index = rows(name).findIndex(row => matches(row, filter)); if (index < 0) return { deletedCount: 0 }; rows(name).splice(index, 1); return { deletedCount: 1 }; },
    async deleteMany(filter) { const before = rows(name); const after = before.filter(row => !matches(row, filter)); data.set(name, after); return { deletedCount: before.length - after.length }; },
    async distinct(key) { return [...new Set(rows(name).flatMap(row => valuesAt(row, key.split('.'))).filter(value => value !== undefined))]; },
    async countDocuments(filter = {}) { return rows(name).filter(row => matches(row, filter)).length; },
    async createIndex() {},
    async bulkWrite(operations) { let upsertedCount = 0, modifiedCount = 0; for (const operation of operations) { if (!operation.updateOne) throw new Error('Unsupported test bulk operation'); const { filter, update, upsert } = operation.updateOne; const result = await this.updateOne(filter, update, { upsert }); upsertedCount += result.upsertedCount; modifiedCount += result.modifiedCount; } return { upsertedCount, modifiedCount }; },
  }; } };
  return db;
}
