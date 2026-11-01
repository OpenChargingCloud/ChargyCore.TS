import {readFileSync} from 'node:fs';
import {describe,expect,test} from 'vitest';
import {readLiveSessionDocument,verifyLiveSessionTransition} from '../src/LiveSessionContinuity';
const file=(name:string):string=>readFileSync(new URL('./fixtures/POILive/'+name+'.json',import.meta.url),'utf8');
const now=Date.parse('2026-11-01T00:16:21Z');
describe('Original live-session continuity',()=>{
    test('validates the genuine cumulative sequence from zero through start/intermediate/end',()=>{
        const names=['00-waiting','01-start','02-intermediate','03-completed'];
        expect(readLiveSessionDocument(file(names[0]??''),now).readings).toHaveLength(0);
        for(let i=1;i<names.length;i++)expect(verifyLiveSessionTransition(file(names[i-1]??''),file(names[i]??''),now).readings).toHaveLength(i);
    });
    test('neither mutated payloads nor imported verification flags can replace original signature checks',()=>{
        const changed=JSON.parse(file('01-start')) as Record<string,unknown>;
        changed['lastUpdated']='2026-11-01T00:05:02Z';changed['signatureVerification']={status:'allValid'};
        expect(()=>verifyLiveSessionTransition(file('00-waiting'),JSON.stringify(changed),now)).toThrow();
    });
    test('a genuine newer document is not a valid update of an unrelated predecessor',()=>{
        expect(()=>verifyLiveSessionTransition(file('00-waiting'),file('02-intermediate'),now)).toThrow(/predecessor/);
    });
    test('future documents and unsupported reference pipelines fail explicitly',()=>{
        expect(()=>readLiveSessionDocument(file('00-waiting'),0)).toThrow(/future/);
        const changed=JSON.parse(file('00-waiting')) as Record<string,unknown>;changed['docRefIdGeneration']=['MD5','hex'];
        expect(()=>readLiveSessionDocument(JSON.stringify(changed),now)).toThrow();
    });
});
