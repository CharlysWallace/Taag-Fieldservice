// Each order and photo is a separate row. The legacy collection remains untouched.
async function schema(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_order_storage (id INTEGER PRIMARY KEY CHECK (id=1), migrated BOOLEAN NOT NULL DEFAULT FALSE)`);
  await db.query(`INSERT INTO app_order_storage (id) VALUES (1) ON CONFLICT DO NOTHING`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_orders (id TEXT PRIMARY KEY, position INTEGER NOT NULL, data JSONB NOT NULL)`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_order_photos (order_id TEXT NOT NULL REFERENCES app_orders(id) ON DELETE CASCADE, id TEXT NOT NULL, position INTEGER NOT NULL, data JSONB NOT NULL, PRIMARY KEY(order_id,id))`);
  await db.query(`CREATE OR REPLACE FUNCTION protect_legacy_orders() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.collection_name='ordens_servico' AND (SELECT migrated FROM app_order_storage WHERE id=1) THEN
      RAISE EXCEPTION 'Atualize o aplicativo: ordens migradas para armazenamento individual' USING ERRCODE='55000';
    END IF;
    RETURN NEW;
  END $$`);
  await db.query('DROP TRIGGER IF EXISTS protect_legacy_orders_update ON app_collections');
  await db.query('CREATE TRIGGER protect_legacy_orders_update BEFORE UPDATE ON app_collections FOR EACH ROW EXECUTE FUNCTION protect_legacy_orders()');
}
async function read(db) {
  const orders=(await db.query('SELECT data FROM app_orders ORDER BY position, id')).rows.map(r=>({...r.data,fotos:[]}));
  const byId=new Map(orders.map(o=>[o.id,o]));
  for(const row of (await db.query('SELECT order_id, data FROM app_order_photos ORDER BY order_id, position, id')).rows) {
    byId.get(row.order_id)?.fotos.push(row.data);
  }
  return orders;
}
function snapshot(orders) {
  if(new Set(orders.map(o=>o.id)).size!==orders.length)throw new Error('Identificações de ordens duplicadas');
  return new Map(orders.map((o,position)=>{
    if(!o.id)throw new Error('Ordem sem identificação');
    const {fotos=[],...data}=o;
    if(new Set(fotos.map(f=>f.id)).size!==fotos.length)throw new Error('Identificações de fotos duplicadas');
    return [o.id,{position,json:JSON.stringify(data),photos:new Map(fotos.map((photo,index)=>{
      if(!photo.id)throw new Error('Foto sem identificação');
      return [photo.id,{position:index,json:JSON.stringify(photo)}];
    }))}];
  }));
}
async function save(db, before, orders) {
  const after=snapshot(orders);
  for(const [id,order] of after) {
    const old=before.get(id);
    if(!old || old.json!==order.json || old.position!==order.position) {
      await db.query('INSERT INTO app_orders (id, position, data) VALUES ($1,$2,$3::jsonb) ON CONFLICT (id) DO UPDATE SET position=EXCLUDED.position, data=EXCLUDED.data',[id,order.position,order.json]);
    }
    for(const [photoId,photo] of order.photos) {
      const prior=old?.photos.get(photoId);
      if(!prior || prior.json!==photo.json || prior.position!==photo.position) {
        await db.query('INSERT INTO app_order_photos (order_id,id,position,data) VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (order_id,id) DO UPDATE SET position=EXCLUDED.position,data=EXCLUDED.data',[id,photoId,photo.position,photo.json]);
      }
    }
    for(const photoId of old?.photos.keys() || [])if(!order.photos.has(photoId))await db.query('DELETE FROM app_order_photos WHERE order_id=$1 AND id=$2',[id,photoId]);
  }
  for(const id of before.keys())if(!after.has(id))await db.query('DELETE FROM app_orders WHERE id=$1',[id]);
}
async function lock(db) {
  return (await db.query('SELECT migrated FROM app_order_storage WHERE id=1 FOR UPDATE')).rows[0].migrated;
}
async function migrate(db) {
  if(await lock(db))return;
  const legacy=(await db.query("SELECT data FROM app_collections WHERE collection_name='ordens_servico' FOR UPDATE")).rows[0]?.data || [];
  await save(db,new Map(),legacy);
  await db.query('UPDATE app_order_storage SET migrated=TRUE WHERE id=1');
  console.log(`[db] Migração concluída: ${legacy.length} ordens e ${legacy.reduce((n,o)=>n+(o.fotos||[]).length,0)} fotos; coleção original preservada.`);
}
module.exports={schema,read,snapshot,save,lock,migrate};
