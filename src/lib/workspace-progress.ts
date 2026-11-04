export interface Mission {code:string;title:string;description:string;xp:number;done:boolean;current:number;target:number;href:string;main:boolean}
export interface WorkspaceProgress {epoch:string;xp:number;level:number;levelName:string;nextXp:number|null;levelStart:number;missions:Mission[]}
