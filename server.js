console.log("opened server");
import { randomInt } from "node:crypto";
import {WebSocketServer} from "ws";
const wss = new WebSocketServer({port:PORT});
const TICK_RATE = 30;
const ARENA_SIZE = 250;
const players = new Map();
const bullets = [];

wss.on("connection",(ws)=>{
    const id = crypto.randomUUID();
    players.set(id,new Player(id,id,ws));
    ws.send(JSON.stringify({type:"init",id}));
    
    ws.on("message",(message)=>{
        const data = JSON.parse(message);
        const player = players.get(id);
        switch(message.type){
            case "move":
                player.vx+=data.vx||0;
                player.vy+=data.vy||0;
                break;
            case "shoot":
                bullets.push(new Bullet(id,player.x,player.y,10,0.1,2));
                break;
            case "init":
                player.name=data.name;
                console.log("name"+data.name);
                break;

        }
    });
    
    const callback = ()=>{
        players.delete(id);
        for(let i=bullets.length-1;i>=0;i--){
            const b=bullets[i];
            if(b.owner===id)bullets.splice(i,1);
        }
    }
    ws.on("close",callback);
    ws.on("error",callback);

    console.log("connected!");
});

class Player{
    constructor(name,id,ws){
        this.name=name;
        this.id=id;
        this.x=ARENA_SIZE+randomInt(ARENA_SIZE*2);
        this.y=ARENA_SIZE+randomInt(ARENA_SIZE*2);
        this.vx=0;
        this.vy=0;
        const nearPlayers = [];
        for(const p of players.values()){
            const dx = p.x-this.x,dy=p.y-this.y;
            if(dx*dx+dy*dy<=220)nearPlayers.push(p.id);
        }
        this.nearPlayers = nearPlayers;
        this.socket=ws;
        this.updated = true;
    }
}

class Bullet{
    constructor(id,x,y,vx,vy,dmg,size,penetration){
        this.x=x;
        this.y=y;
        this.vx=vx;
        this.vy=vy;
        this.dmg=dmg;
        this.size=size;
        this.penetration=penetration;
        this.owner=id;
    }
}

setInterval(()=>{
    players.forEach(p=>{
        if(p.vx!==0||p.vy!==0){
            p.x+=p.vx;
            p.y+=p.vy;
            p.vx=0;
            p.vy=0;
            p.updated = true;
        }
    });

    players.forEach(p=>{
        const ws = p.socket;
        const snapshot = p.nearPlayers.map(n=>players[n.id]).filter(n=>n&&n.updated);
        ws.send(JSON.stringify({type:"state",snapshot}));
    });

    players.forEach(p=>p.updated=false);
},TICK_RATE);
