// Test process only: never loaded by the application in production.
const original=global.fetch;
global.fetch=async(url,options)=>{
 if(url!=='https://api.openai.com/v1/responses')return original(url,options);
 const body=JSON.parse(options.body);
 if(body.store!==false||body.input.some(m=>!['user','assistant'].includes(m.role))||!body.instructions.includes('Perfil autenticado: TECNICO'))throw Error('Invalid provider request');
 return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'Abra Ajuda nas Configurações.'}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
};
