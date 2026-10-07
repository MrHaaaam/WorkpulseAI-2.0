export function demoDatabaseName(env = process.env) {
  if (env.DEMO_LOGIN_ENABLED === 'true' && env.DEMO_DEPLOYMENT !== 'true') throw new Error('Demo login requires a separate DEMO_DEPLOYMENT=true test backend.');
  if (env.DEMO_DEPLOYMENT !== 'true') return undefined;
  if (!/^workpulse_demo_[a-z0-9_]+$/.test(env.DEMO_DATABASE_NAME ?? '')) throw new Error('Set DEMO_DATABASE_NAME to a dedicated workpulse_demo_* database.');
  return env.DEMO_DATABASE_NAME;
}

export function demoLoginEnabled() {
  return process.env.DEMO_DEPLOYMENT === 'true' && process.env.DEMO_LOGIN_ENABLED === 'true';
}

export function demoAccessAllowed(account) {
  return !account?.demo || demoLoginEnabled();
}

export async function seedDemo(db, hashSecret) {
  if (!demoLoginEnabled()) {
    if (process.env.DEMO_DEPLOYMENT === 'true') await db.collection('admin_sessions').deleteMany({ demo: true });
    return;
  }
  const marker = await db.collection('demo_workspace').findOne({ id: 'demo' });
  if (!marker) {
    for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
      if (await db.collection(name).countDocuments({}) > 0) throw new Error('Demo database must be empty on first setup. Refusing to use existing records.');
    }
    await db.collection('demo_workspace').insertOne({ id: 'demo', createdAt: new Date() });
  }
  const createdAt = new Date();
  await db.collection('employees').updateOne({ id: 'DEMO-EMP-001' }, { $setOnInsert: {
    id: 'DEMO-EMP-001', name: 'Demo Employee', role: 'regular', status: 'active', email: 'employee@demo.invalid',
    initials: 'DE', hourlyRate: 100, biometricStatus: 'not-enrolled', createdAt,
  } }, { upsert: true });
  for (const [username, password, role, collection] of [
    ['admin', 'admin123', 'admin', 'admin_accounts'], ['employee', 'employee123', 'regular', 'employee_accounts'],
  ]) {
    await db.collection(collection).updateOne({ email: `${username}@demo.invalid` }, { $set: {
      email: `${username}@demo.invalid`, name: `Demo ${username}`, role, active: true, demo: true,
      passwordHash: await hashSecret(password), mustChangePassword: false,
      ...(role !== 'admin' ? { employeeId: 'DEMO-EMP-001' } : {}),
    }, $setOnInsert: { createdAt } }, { upsert: true });
  }
}
