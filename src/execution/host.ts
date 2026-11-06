import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { parseCanonicalJson } from '../contracts/integrity.js';
export function identifier(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(value)) throw new Error('INVALID_IDENTIFIER');
  return value;
}
export function within(root: string, candidate: string): boolean {
  const rel=path.relative(root,candidate);return rel !== '..' && !rel.startsWith('../') && !path.isAbsolute(rel);
}
export function safePath(root: string, relative: string, mustExist = true): string {
  const realRoot=fs.realpathSync(root);
  if (path.isAbsolute(relative) || relative.split('/').some(p=>p==='..'||p==='') || relative.includes('\0')) throw new Error('UNSAFE_PATH');
  const target=path.resolve(realRoot,relative);
  if (!within(realRoot,target)) throw new Error('PATH_ESCAPE');
  let current=realRoot;
  for(const part of relative.split('/')) {
    current=path.join(current,part);
    if (!fs.existsSync(current) && !fs.lstatSync(current,{throwIfNoEntry:false})) {
      if(mustExist) throw new Error('MISSING_PATH');
      continue;
    }
    if(fs.lstatSync(current).isSymbolicLink()) throw new Error('SYMLINK_FORBIDDEN');
    if(!within(realRoot,fs.realpathSync(current))) throw new Error('PATH_ESCAPE');
  }
  return target;
}
export function writeNew(file: string, data: unknown): void {
  fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
}
export function atomicJson(file: string, data: unknown): void {
  const tmp=file+'.'+randomUUID()+'.tmp';writeNew(tmp,data);fs.renameSync(tmp,file);
}
export function readJson(file: string): unknown {return parseCanonicalJson(fs.readFileSync(file,'utf8'));}
export const HOST_ENV: NodeJS.ProcessEnv = {PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0',GIT_AUTHOR_NAME:'Synthetic Lab',GIT_AUTHOR_EMAIL:'synthetic@example.invalid',GIT_COMMITTER_NAME:'Synthetic Lab',GIT_COMMITTER_EMAIL:'synthetic@example.invalid',GIT_AUTHOR_DATE:'2026-01-01T00:00:00Z',GIT_COMMITTER_DATE:'2026-01-01T00:00:00Z'};
export function git(workspace: string, args: readonly string[]): string {
  return execFileSync('/usr/bin/git',['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','core.quotePath=false',...args],{cwd:workspace,env:HOST_ENV,encoding:'utf8',maxBuffer:8*1024*1024,timeout:10000});
}
