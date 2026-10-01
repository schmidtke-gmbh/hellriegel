import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLeadTablePayload, buildSubmissionHandler, parseSubmission } from '../netlify/functions/lib/leadtable-forwarder.mjs';

const base = {
  id: '0123456789abcdef01234567',
  form_name: 'erstgespraech',
  created_at: '2026-09-29T10:00:00.000Z',
  data: {
    'form-name': 'erstgespraech', vorname: 'Max', nachname: 'Mustermann',
    email: 'max@example.com', telefon: '0123456789', anliegen: 'Implantat', ziel: 'Beratung',
  },
};

test('accepts all three configured forms and ignores others', () => {
  for (const form_name of ['erstgespraech', 'kontakt', 'bewerbung']) {
    assert.equal(parseSubmission(JSON.stringify({ ...base, form_name })).formName, form_name);
  }
  assert.equal(parseSubmission(JSON.stringify({ ...base, form_name: 'newsletter' })), null);
});

test('rejects malformed approved submissions', () => {
  assert.throws(() => parseSubmission(JSON.stringify({ ...base, id: 'bad' })), /Invalid/);
  assert.throws(() => parseSubmission(JSON.stringify({ ...base, data: [] })), /Invalid/);
  assert.throws(() => parseSubmission(JSON.stringify({ payload: null, ...base })), /Invalid/);
});

test('maps Netlify data into LeadTable fields', () => {
  const parsed = parseSubmission(JSON.stringify({ ...base, data: {
    ...base.data, name: 'Gefälscht', phone: '999', formular: 'falsch',
    netlify_submission_id: 'gefälscht', quelle: 'falsch', files: [{ url: 'https://example.com/file.pdf' }],
  } }));
  const payload = buildLeadTablePayload(parsed);
  assert.equal(payload.fields.name, 'Max Mustermann');
  assert.equal(payload.fields.email, 'max@example.com');
  assert.equal(payload.fields.phone, '0123456789');
  assert.equal(payload.fields.formular, 'erstgespraech');
  assert.equal(payload.fields.netlify_submission_id, base.id);
  assert.equal(payload.fields.anliegen, 'Implantat');
  assert.equal(payload.fields.quelle, 'hellriegel-zahnmedizin.de');
  assert.equal(payload.fields.files, '[{"url":"https://example.com/file.pdf"}]');
  assert.equal(payload.fields['form-name'], undefined);
});

test('forwards payload to the allowlisted LeadTable endpoint', async () => {
  const calls=[];
  const timeoutCalls=[];
  const testSignal=new AbortController().signal;
  const handler=buildSubmissionHandler({endpoint:'https://api-v2.lead-table.com/webhooks/example',signalFactory:(ms)=>{timeoutCalls.push(ms);return testSignal;},fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,uid:'lead-1'}),{status:200});}});
  const response=await handler({body:JSON.stringify(base)});
  assert.equal(response.statusCode,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.method,'POST');
  assert.equal(calls[0].options.signal,testSignal);
  assert.deepEqual(timeoutCalls,[10000]);
  assert.equal(JSON.parse(calls[0].options.body).fields.name,'Max Mustermann');
});

test('routes applications to the dedicated application campaign', async () => {
  const calls=[];
  const handler=buildSubmissionHandler({
    endpoint:'https://api-v2.lead-table.com/webhooks/patienten',
    applicationEndpoint:'https://api-v2.lead-table.com/webhooks/bewerbung',
    fetchImpl:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify({success:true,uid:'lead-1'}),{status:200});},
  });
  const response=await handler({body:JSON.stringify({...base,form_name:'bewerbung',data:{...base.data,'form-name':'bewerbung'}})});
  assert.equal(response.statusCode,200);
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api-v2.lead-table.com/webhooks/bewerbung');
  assert.equal(JSON.parse(calls[0].options.body).fields.formular,'bewerbung');
});

test('uploads Netlify application files to the created LeadTable lead', async () => {
  const calls=[];
  const handler=buildSubmissionHandler({
    endpoint:'https://api-v2.lead-table.com/webhooks/patienten',
    applicationEndpoint:'https://api-v2.lead-table.com/webhooks/bewerbung',
    leadTableApiKey:'test-api-key',
    leadTableApiEmail:'fabian@schmidtkeconsulting.de',
    fetchImpl:async(url,options={})=>{
      calls.push({url,options});
      if(url==='https://api-v2.lead-table.com/webhooks/bewerbung') {
        return new Response(JSON.stringify({success:true,uid:'0123456789abcdef01234567'}),{status:200});
      }
      if(url==='https://d33wubrfki0l68.cloudfront.net/example/lebenslauf.pdf') {
        return new Response('pdf bytes',{status:200,headers:{'content-type':'application/pdf'}});
      }
      if(url==='https://app.lead-table.com/api/upload/0123456789abcdef01234567') {
        return new Response(JSON.stringify({ok:true}),{status:200});
      }
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const response=await handler({body:JSON.stringify({
    ...base,
    form_name:'bewerbung',
    data:{
      ...base.data,
      'form-name':'bewerbung',
      files:{filename:'lebenslauf.pdf',type:'file',size:9,url:'https://d33wubrfki0l68.cloudfront.net/example/lebenslauf.pdf'},
    },
  })});
  assert.equal(response.statusCode,200);
  assert.equal(calls.length,3);
  assert.equal(calls[2].options.method,'POST');
  assert.equal(calls[2].options.headers['x-api-key'],'test-api-key');
  assert.equal(calls[2].options.headers.email,'fabian@schmidtkeconsulting.de');
  const uploadedFile=calls[2].options.body.get('avatar');
  assert.equal(uploadedFile.name,'lebenslauf.pdf');
  assert.equal(await uploadedFile.text(),'pdf bytes');
  assert.deepEqual(JSON.parse(response.body),{ok:true,leadUid:'0123456789abcdef01234567',attachmentsUploaded:1,attachmentErrors:0});
});

test('uploads the same Netlify file only once when it appears in both file collections', async () => {
  const descriptor={filename:'lebenslauf.pdf',type:'file',size:9,url:'https://d33wubrfki0l68.cloudfront.net/example/lebenslauf.pdf'};
  const calls=[];
  const handler=buildSubmissionHandler({
    applicationEndpoint:'https://api-v2.lead-table.com/webhooks/bewerbung',
    leadTableApiKey:'test-api-key',
    leadTableApiEmail:'fabian@schmidtkeconsulting.de',
    fetchImpl:async(url,options={})=>{
      calls.push({url,options});
      if(url==='https://api-v2.lead-table.com/webhooks/bewerbung') return new Response(JSON.stringify({success:true,uid:'0123456789abcdef01234567'}));
      if(url===descriptor.url) return new Response('pdf bytes',{headers:{'content-type':'application/pdf'}});
      if(url==='https://app.lead-table.com/api/upload/0123456789abcdef01234567') return new Response('{}');
      throw new Error(`unexpected URL: ${url}`);
    },
  });
  const response=await handler({body:JSON.stringify({
    payload:{...base,form_name:'bewerbung',files:{'files[]':descriptor},data:{...base.data,'form-name':'bewerbung',files:descriptor}},
  })});
  assert.equal(calls.length,3);
  assert.equal(JSON.parse(response.body).attachmentsUploaded,1);
});

test('never falls back to the patient campaign when the application endpoint is missing', async () => {
  let fetched=false;
  const handler=buildSubmissionHandler({
    endpoint:'https://api-v2.lead-table.com/webhooks/patienten',
    fetchImpl:async()=>{fetched=true;return new Response('',{status:200});},
  });
  const response=await handler({body:JSON.stringify({...base,form_name:'bewerbung',data:{...base.data,'form-name':'bewerbung'}})});
  assert.equal(response.statusCode,500);
  assert.equal(fetched,false);
});

test('accepts LeadTable plain-text UID success responses', async () => {
  const handler=buildSubmissionHandler({endpoint:'https://api-v2.lead-table.com/webhooks/example',fetchImpl:async()=>new Response('0123456789abcdef01234567',{status:200,headers:{'content-type':'text/html'}})});
  const response=await handler({body:JSON.stringify(base)});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).leadUid,'0123456789abcdef01234567');
});

test('ignores unrelated forms before checking webhook configuration', async () => {
  let fetched=false;
  const handler=buildSubmissionHandler({endpoint:'not a URL',fetchImpl:async()=>{fetched=true;throw new Error('must not fetch');}});
  const response=await handler({body:JSON.stringify({...base,form_name:'newsletter'})});
  assert.equal(response.statusCode,200);
  assert.equal(JSON.parse(response.body).ignored,true);
  assert.equal(fetched,false);
});

test('rejects unsafe or malformed webhook endpoints without crashing', async () => {
  for (const endpoint of ['not a URL','http://api-v2.lead-table.com/hook','https://example.com/hook','https://user:pass@api-v2.lead-table.com/hook']) {
    const handler=buildSubmissionHandler({endpoint});
    const response=await handler({body:JSON.stringify(base)});
    assert.equal(response.statusCode,500);
  }
});

test('fails closed without leaking upstream details', async () => {
  const handler=buildSubmissionHandler({endpoint:'https://api-v2.lead-table.com/webhooks/example',fetchImpl:async()=>new Response('secret upstream error',{status:500})});
  const response=await handler({body:JSON.stringify(base)});
  assert.equal(response.statusCode,502);
  assert.doesNotMatch(response.body,/secret upstream error|max@example.com/);
});

test('handles non-JSON and network failures with sanitized responses', async () => {
  const cases=[
    async()=>new Response('not valid uid!',{status:200}),
    async()=>new Response('not-json',{status:200}),
    async()=>new Response('NotFound',{status:200}),
    async()=>new Response('Unauthorized',{status:200}),
    async()=>new Response('InternalServerError',{status:200}),
    async()=>{throw new Error('network secret max@example.com');},
  ];
  for (const fetchImpl of cases) {
    const handler=buildSubmissionHandler({endpoint:'https://api-v2.lead-table.com/webhooks/example',fetchImpl});
    const response=await handler({body:JSON.stringify(base)});
    assert.equal(response.statusCode,502);
    assert.doesNotMatch(response.body,/not valid uid|not-json|NotFound|Unauthorized|InternalServerError|network secret|max@example.com/);
  }
});
