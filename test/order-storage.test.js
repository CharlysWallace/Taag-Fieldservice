const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require(process.env.PGLITE_PATH || '@electric-sql/pglite');
const storage=require('../src/order-storage');
test('migração preserva legado, atualiza apenas a foto alterada e reverte falhas',async()=>{
 const db=new PGlite();
 try {
  await db.query('CREATE TABLE app_collections (collection_name TEXT PRIMARY KEY,data JSONB NOT NULL)');
  const legacy=Array.from({length:40},(_,i)=>({id:'os'+i,clienteSnapshot:{nome:'Cliente '+i},assinatura:'assinatura',edicoesRelatorio:3,fotos:[{id:'f1',src:'a'.repeat(250000),descricao:'Antes'},{id:'f2',src:'b'.repeat(250000),descricao:'Depois'}]}));
  await db.query('INSERT INTO app_collections VALUES ($1,$2::jsonb)',['ordens_servico',JSON.stringify(legacy)]);
  await storage.schema(db);
  await db.query('BEGIN');await storage.migrate(db);await db.query('COMMIT');
  assert.deepEqual(await storage.read(db),legacy);
  assert.deepEqual((await db.query('SELECT data FROM app_collections')).rows[0].data,legacy);
  await db.query('BEGIN');await storage.migrate(db);await db.query('COMMIT');
  assert.equal((await storage.read(db)).length,40);
  const orders=await storage.read(db),before=storage.snapshot(orders),writes=[];
  orders[0].fotos.push({id:'new-photo',src:'c'.repeat(250000),descricao:'Nova foto'});
  const tracked={query:async(sql,args)=>{writes.push({sql,args});return db.query(sql,args);}};
  await db.query('BEGIN');await storage.lock(db);await storage.save(tracked,before,orders);await db.query('COMMIT');
  assert.equal(writes.length,1);assert.match(writes[0].sql,/INSERT INTO app_order_photos/);assert.ok(JSON.stringify(writes[0].args).length<260000);
  assert.deepEqual(await storage.read(db),orders);
  await assert.rejects(db.query("UPDATE app_collections SET data='[]' WHERE collection_name='ordens_servico'"),/Atualize o aplicativo/);
  const next=await storage.read(db),previous=storage.snapshot(next);next[0].fotos[0].descricao='Revisada';next[0].fotos.splice(1,1);next.splice(1,1);
  await db.query('BEGIN');await storage.save(db,previous,next);await db.query('ROLLBACK');assert.deepEqual(await storage.read(db),orders);
  await db.query('BEGIN');await storage.save(db,previous,next);await db.query('COMMIT');assert.deepEqual(await storage.read(db),next);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM app_order_photos WHERE order_id='os1'")).rows[0].n,0);
  assert.deepEqual((await db.query('SELECT data FROM app_collections')).rows[0].data,legacy);
 } finally {await db.close();}
});
