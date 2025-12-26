console.log("opened server");
import crypto,{ randomInt } from "node:crypto";
import {WebSocketServer} from "ws";
const wss = new WebSocketServer({port:process.env.PORT||8080});
const TICK_RATE = 30;
const ARENA_SIZE = 15;
const players = new Map();
const bullets = [];

class Ship{
    constructor(hp,dmg,speed,bulletSpeed,bulletSize,bulletPenetration,steering){
        this.hp=hp;
        this.dmg=dmg;
        this.speed=speed;
        this.bulletSpeed=bulletSpeed;
        this.bulletSize=bulletSize;
        this.bulletPenetration=bulletPenetration;
        this.steering = steering;
    }
}

const S = (a,b,c,d,e,f,g)=>new Ship(a,b,c,d,e,f,g);
const ships = Object.freeze({
    basic:S(100,10,1,2,0.1,2,0.1)
});

wss.on("connection",(ws)=>{
    const id = crypto.randomInt(0,65535);
    players.set(id,new Player(id,id,ws));
    ws.send(JSON.stringify({type:"init",id}));
    
    ws.on("message",(message)=>{
        const data = JSON.parse(message.toString());
        const player = players.get(id);
        switch(data.type){
            case "move":
                player.cx+=data.vx||0;
                player.cy+=data.vy||0;
                player.update();
                break;
            case "shoot":
                bullets.push(new Bullet(id,player.x,player.y,10,0.1,2));
                break;
            case "init":
                player.name=data.name;
                console.log("name"+data.name);
                break;
            default:
                console.error("Unsupported type: "+data.type)
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

class Vector2{
    constructor(x,y){
        this.x=x||0;
        this.y=y||0;
    }
    len(){return Math.hypot(this.x,this.y);}
    norm(){const l=this.len();this.x/=l;this.y/=l;return this;}
    rotate(s,c){const xc=this.x;this.x=this.x*c-this.y*s;this.y=xc*s+this.y*c;return this;}
    add(v){this.x+=v.x;this.y+=v.y;return this;}
    sub(v){this.x-=v.x;this.y-=v.y;return this;}
    abs(){this.x=Math.abs(this.x);this.y=Math.abs(this.y);return this;}
    dot(v){return this.x*v.x+this.y*v.y;}
    sq(){return this.x**2+this.y**2;}
    scale(n){this.x*=n;this.y*=n;return this;}
    static one(n){return new Vector2(n,n);}
}

class Player{
    constructor(name,id,ws){
        this.name=name;
        this.id=id;
        this.x=-ARENA_SIZE+randomInt(ARENA_SIZE*2);
        this.y=-ARENA_SIZE+randomInt(ARENA_SIZE*2);
        this.speed = 0;
        this.angle = Math.random()*Math.PI*2;
        this.vector = new Vector2();
        this.cx=0;
        this.cy=0;
        const nearPlayers = [];
        for(const p of players.values()){
            const dx = p.x-this.x,dy=p.y-this.y;
            if(dx*dx+dy*dy<=220)nearPlayers.push(p.id);
        }
        this.nearPlayers = nearPlayers;
        this.socket=ws;
        this.updated = true;
        this.ship = ships.basic;
    }

    update(){
        this.angle+=this.cy*this.ship.steering;
        this.speed = Math.max(-this.ship.speed,Math.min(this.ship.speed,this.speed+cx));
        this.vector.x+=Math.cos(this.angle)*this.speed;
        this.vector.y+=Math.sin(this.angle)*this.speed;
    }
}

function getPlayerDeltaArray(p){
    return [p.x,p.y,p.vector.x,p.vector.y,p.angle,p.id];
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
        if(p.vector.x!==0||p.vector.y!==0){
            p.x+=p.vector.x;
            p.y+=p.vector.y;
            p.updated = true;
        }
    });

    const snapshot = [];
    for(const p of player.values()){
        snapshot.push(...getPlayerDeltaArray(p));
    }
    const s = new Float32Array(snapshot);

    players.forEach(p=>{
        const ws = p.socket;
        ws.send(s.buffer);
    });

    players.forEach(p=>p.updated=false);
},1000/TICK_RATE);
