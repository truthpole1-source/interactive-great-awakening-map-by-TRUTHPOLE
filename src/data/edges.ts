export type EdgeType='evidence'|'rumor'|'overlap'|'citation'|'timeline';
export type Edge={id:string;from:string;to:string;label?:string;strength?:1|2|3;type?:EdgeType};
export const DEFAULT_EDGES:Edge[]=[
{id:'e1',from:'anunnaki',to:'nibiru',label:'linked narrative',strength:2,type:'overlap'},
{id:'e2',from:'remote-viewing',to:'crash-retrieval',label:'claims overlap',strength:1,type:'overlap'},
{id:'e3',from:'triangular-craft',to:'crash-retrieval',label:'black budget?',strength:1,type:'rumor'},
{id:'e4',from:'usos',to:'triangular-craft',label:'pattern echoes',strength:1,type:'overlap'}
];
