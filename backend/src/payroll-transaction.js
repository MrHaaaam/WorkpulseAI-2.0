// Payroll preparation updates both the destination statement and carried source
// statements. Use one snapshot so an inclusion/removal cannot race a carry-forward.
export async function payrollTransaction(db, work) {
  // In-memory database doubles used by unit tests do not have a MongoDB client.
  if (!db.client?.startSession) return work(db);
  const session = db.client.startSession();
  const transactionDb = {
    inPayrollTransaction: true,
    collection(name) {
      const collection = db.collection(name);
      return {
        find: (filter, options) => collection.find(filter, { ...options, session }),
        findOne: (filter, options) => collection.findOne(filter, { ...options, session }),
        insertOne: (document, options) => collection.insertOne(document, { ...options, session }),
        updateOne: (filter, update, options) => collection.updateOne(filter, update, { ...options, session }),
        updateMany: (filter, update, options) => collection.updateMany(filter, update, { ...options, session }),
        findOneAndUpdate: (filter, update, options) => collection.findOneAndUpdate(filter, update, { ...options, session }),
        deleteMany: (filter, options) => collection.deleteMany(filter, { ...options, session }),
      };
    },
  };
  try {
    return await session.withTransaction(() => work(transactionDb), { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally { await session.endSession(); }
}
