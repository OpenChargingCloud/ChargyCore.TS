import {readFileSync} from 'node:fs';
import {createPrivateKey,createPublicKey,createHash,sign} from 'node:crypto';
import {describe,expect,test} from 'vitest';
import {verifyLiveSessionAuthority,readLiveSessionDocument,canonicalJSONBytes} from '../src/index';
import type {ILiveCPOAuthority} from '../src/index';
const now=Date.parse('2026-11-01T00:16:21Z'),fixture=(name:string):string=>readFileSync(new URL('./fixtures/POILive/'+name+'.json',import.meta.url),'utf8');
function key(seed:number):{privateKey:ReturnType<typeof createPrivateKey>;publicKey:ILiveCPOAuthority['keys'][number];id:string}{
    const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),Buffer.alloc(32,seed)]),format:'der',type:'pkcs8'});
    const spki=createPublicKey(privateKey).export({format:'der',type:'spki'});
    return {privateKey,publicKey:{algorithm:'EdDSA-Ed25519',encodings:['SubjectPublicKeyInfo','DER','hex'],value:spki.toString('hex').toUpperCase(),keyUsage:['signCTRs']},id:createHash('sha256').update(spki).digest('hex').toUpperCase()};
}
const old=key(161),next=key(162),authority:ILiveCPOAuthority={operatorId:'DE*POI',chargingStationId:'DE*POI*S1',evseId:'DE*POI*E1*1',keys:[old.publicKey]};
function document(previous:string,signers:readonly ReturnType<typeof key>[]):string{
    const before=JSON.parse(previous) as Record<string,unknown>,{signatures:_,...json}=before;
    json['lastUpdated']=new Date(Date.parse(before['lastUpdated'] as string)+1000).toISOString();json['updates']=readLiveSessionDocument(previous,now).reference.toUpperCase();
    const cpo=json['chargingStationOperator'] as Record<string,unknown>;cpo['publicKeys']=signers.map(item=>item.publicKey);
    return JSON.stringify({...json,signatures:signers.map(item=>({keyId:item.id,algorithm:'EdDSA-Ed25519',signedData:{excludedProperties:['signatures'],encodings:['JSON','JCS','UTF-8']},encodings:['hex'],value:sign(null,canonicalJSONBytes(json),item.privateKey).toString('hex').toUpperCase()}))});
}
describe('Independent CPO envelope authorization',()=>{
    test('verifies original fixture signatures with independently provided CPO keys',()=>{expect(verifyLiveSessionAuthority(fixture('00-waiting'),authority,undefined,now).evseId).toBe(authority.evseId);});
    test('a mathematically valid foreign self-signature and mismatched owner cannot grant authority',()=>{
        const forged=document(fixture('00-waiting'),[key(199)]);expect(readLiveSessionDocument(forged,now).id).toBeTruthy();expect(()=>verifyLiveSessionAuthority(forged,authority,undefined,now)).toThrow(/authorized/);
        expect(()=>verifyLiveSessionAuthority(fixture('00-waiting'),{...authority,operatorId:'FOREIGN'},undefined,now)).toThrow();
        expect(()=>verifyLiveSessionAuthority(fixture('00-waiting'),{...authority,keys:[{...old.publicKey,keyUsage:['priceStatements']}]},undefined,now)).toThrow();
    });
    test('an authorized co-signed bridge permits the new key alone in the following original',()=>{
        const original=fixture('01-start'),cross=document(original,[old,next]),after=document(cross,[next]),both={...authority,keys:[old.publicKey,next.publicKey]};
        expect(verifyLiveSessionAuthority(cross,both,original,now).readings).toHaveLength(1);expect(verifyLiveSessionAuthority(after,both,cross,now).readings).toHaveLength(1);
        expect(()=>verifyLiveSessionAuthority(document(original,[next]),both,original,now)).toThrow(/co-signature/);
        expect(()=>verifyLiveSessionAuthority(cross,authority,original,now)).toThrow(/authorized/);
    });
});
