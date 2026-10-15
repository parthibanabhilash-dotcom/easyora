const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element(){return {listeners:{},attrs:{},hidden:true,textContent:'',value:'',classList:{toggle(){},remove(){}},addEventListener(t,f){this.listeners[t]=f},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},focus(){this.focused=true},select(){this.selected=true},setSelectionRange(){}}}
const menu=element(), navigation=element(), form=element(), status=element(),output=element(),text=element(), select=element();
const elements={'navigation':navigation,'brief-form':form,'brief-status':status,'brief-output':output,'brief-text':text,'select-brief':select};
const values={name:'Test User',email:'test@example.com',project:'Business website',budget:'Let’s discuss',timeline:'Flexible / exploring',goals:'Create a clear website for a new local business.'};
form.reportValidity=()=>true;
let copied='';
const context={document:{querySelector:()=>menu,getElementById:id=>elements[id],addEventListener(){}},window:{matchMedia:()=>({addEventListener(){}})},navigator:{clipboard:{writeText:async t=>{copied=t}}},FormData:class{get(k){return values[k]}}};
vm.runInNewContext(fs.readFileSync('dist/assets/main.js','utf8'),context);
(async()=>{
 menu.listeners.click();assert.equal(menu.attrs['aria-expanded'],'true');menu.listeners.click();assert.equal(menu.attrs['aria-expanded'],'false');
 await form.listeners.submit({preventDefault(){}});assert(copied.includes(values.goals));assert(copied.includes(values.email));assert.equal(output.hidden,false);assert(status.textContent.includes('Nothing has been sent'));
 form.listeners.input();assert.equal(output.hidden,true);assert.equal(text.value,'');
 context.navigator.clipboard.writeText=async()=>{throw Error('Denied')};await form.listeners.submit({preventDefault(){}});assert(status.textContent.includes('Automatic copying is unavailable'));assert.equal(text.selected,true);assert.equal(output.hidden,false);
 select.listeners.click();assert(status.textContent.includes('Brief selected'));
 values.goals='   ';await form.listeners.submit({preventDefault(){}});assert(status.textContent.includes('at least 20 characters'));
 console.log('PASS: navigation toggle, brief content, clipboard success, denied-clipboard fallback, manual selection, stale brief clearing, whitespace validation.');
})().catch(e=>{console.error(e);process.exitCode=1});
