console.log("opened server");
import crypto,{ randomInt } from "node:crypto";
import {WebSocketServer} from "ws";
const wss = new WebSocketServer({port:process.env.PORT||8080});
const TICK_RATE = 30;
const ARENA_SIZE = 15;
const GRID_SIZE = 10;
const players = new Map();
const bullets = [];
const GRID_COUNT = Math.ceil(ARENA_SIZE/GRID_SIZE);
class ObjectSet{
    constructor(){
        this.items = [];
        if(!ObjectSet.index)ObjectSet.index=0;
        this.i = ObjectSet.index++;
    }
    add(o){
        if(o["_ObjectSetIndex"+this.i])return;
        o["_ObjectSetIndex"+this.i] = this.items.length;
        this.items.push(o);
    }
    has(o){
        return o["_ObjectSetIndex"+this.i]!==undefined;
    }
    delete(o){
        const i = o["_ObjectSetIndex"+this.i];
        const last = this.items.pop();
        if(i===undefined)return;
        if(i<this.items.length){
            this.items[i] = last;
            last["_ObjectSetIndex"+this.i] = i;
        }
        delete o["_ObjectSetIndex"+this.i];
    }
    forEach(fn){
        for(const o of this.items)fn(o);
    }
    size(){
        return this.items.length;
    }
    clear(){
        this.forEach(o=>delete o["_ObjectSetIndex"+this.i]);
        this.items.length = 0;
    }
    [Symbol.iterator]() {
        let index = 0;
        const data = this.items;
        return {
            next: () => ({
                value: data[index++],
                done: index > data.length
            })
        };
    }
}
const grid = Array.from({length:GRID_COUNT},()=>Array.from({length:GRID_COUNT},()=>new ObjectSet()));

class Ship{
    constructor(hp,dmg,speed,bulletSpeed,bulletSize,bulletPenetration,steering,sx,sy){
        this.hp=hp;
        this.dmg=dmg;
        this.speed=speed;
        this.bulletSpeed=bulletSpeed;
        this.bulletSize=bulletSize;
        this.bulletPenetration=bulletPenetration;
        this.steering = steering;
        this.half = new Vector2(sx,sy);
    }
}

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
    clone(){return new Vector2(this.x,this.y);}
    scale(n){this.x*=n;this.y*=n;return this;}
    max(){return Math.max(this.x,this.y);}
    min(){return Math.min(this.x,this.y);}
    subImm(v){return new Vector2(this.x-v.x,this.y-v.y);}
    addImm(v){return new Vector2(this.x+v.x,this.y+v.y);}
    static one(n){return new Vector2(n,n);}
}

const S = (a,b,c,d,e,f,g)=>new Ship(a,b,c,d,e,f,g);
const ships = Object.freeze({
    basic:S(100,10,1,2,0.1,2,0.01,1,2)
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

function setCell(x,y,o){
    grid[Math.floor(x)]?.[Math.floor(y)]?.add(o);
}

class Player{
    constructor(name,id,ws){
        this.name=name;
        this.id=id;
        this.c=new Vector2(-ARENA_SIZE+randomInt(ARENA_SIZE*2),-ARENA_SIZE+randomInt(ARENA_SIZE*2));
        this.speed = 0;
        this.angle = Math.random()*Math.PI*2;
        this.vector = new Vector2();
        this.cx=0;
        this.cy=0;
        this.socket=ws;
        this.updated = true;
        this.ship = ships.basic;
        this.hp = this.ship.hp;
    }

    update(){
        this.angle+=this.cy*this.ship.steering;
        this.speed = Math.max(-this.ship.speed,Math.min(this.ship.speed,this.speed+this.cx));
        this.sin = Math.sin(this.angle);
        this.cos = Math.cos(this.angle);
        this.vector.x+=this.cos*this.speed;
        this.vector.y+=this.sin*this.speed;
        this.setCells();
    }

    setCells(){
        const half = this.ship.half;
        const v=(x,y)=>[x,y]
        const pts = [v(this.c.x-half.x*2,this.c.y-half.y*2),v(this.c.x+half.x*2,this.c.y-half.y*2),v(this.c.x-half.x*2,this.c.y+half.y*2),v(this.c.x+half.x*2,this.c.y+half.y*2)];
        for(const pt of pts)setCell(pt[0],pt[1],this);
    }

    getAxis(){
        return [new Vector2(this.cos,this.sin),new Vector2(-this.sin,this.cos)];
    }

    project(axis,axes){
        const ax = axes[0];
        const ay = axes[1];
        const centerProj = this.c.dot(axis);
        const extent = this.ship.half.x * Math.abs(ax.dot(axis)) + this.ship.half.y * Math.abs(ay.dot(axis));
        return { min: centerProj - extent, max: centerProj + extent };
    }

    overlap(other,axis,thisAxes,otherAxes){
        return {pa:this.project(axis,thisAxes),pb:other.project(axis,otherAxes)};
    }

    collide(other){
        const thisAxes = this.getAxis(),otherAxes = other.getAxis(),axes = [...thisAxes,...otherAxes];
        for(const axis of axes){
            const {pa,pb} = this.overlap(other,axis,thisAxes,otherAxes);
            if(pa.min>=pb.max||pb.min>=pa.max)return false;
        }
        return true;
    }

    collideBullet(b) {
        let axes = this.getAxis();
        let closestPoint = this.c;

        let relative = b.c.clone().sub(this.c);
        let localX = axes[0].dot(relative);
        let localY = axes[1].dot(relative);

        let clampedX = Math.max(-this.ship.half.x, Math.min(this.ship.half.x, localX));
        let clampedY = Math.max(-this.ship.half.y, Math.min(this.ship.half.y, localY));

        let closest = this.c.clone().add(axes[0].mul(clampedX)).add(axes[1].mul(clampedY));
        let dist = closest.sub(circle.c).sq();

        return dist <= b.size**2;
    }
}

function getPlayerDeltaArray(p){
    return [p.c.x,p.c.y,p.vector.x,p.vector.y,p.angle,p.id];
}

class Bullet{
    constructor(id,x,y,vx,vy,dmg,size,penetration){
        this.c = new Vector2(x,y);
        this.vx=vx;
        this.vy=vy;
        this.dmg=dmg;
        this.size=size;
        this.penetration=penetration;
        this.owner=id;
        this.isBullet = true;
    }
}

setInterval(()=>{
    for(const row of grid){
        for(const node of row){
            for(let i=0;i<node.items.length;i++){
                const n1 = node.items[i];
                for(let j=i+1;j<node.items.length;j++){
                    const n2 = node.items[j];
                    if(n1===n2||(n1.owner&&n1.owner===n2.id||n2.owner&&n2.owner===n1.id))continue;
                    if(n1.isBullet&&n2.isBullet)continue;
                    if(!n1.isBullet&&!n2.isBullet){
                        if(n1.c.subImm(n2.c).sq()>(n1.ship.half.max()+n2.ship.half.max())**2)continue;
                        if(n1.collide(n2)){
                            n1.hp-=20;//placeholders
                            n2.hp-=20;
                        }
                        continue;
                    }else{
                        let bullet,ship;
                        if(n1.isBullet){bullet=n1;ship=n2;}
                        else {bullet=n2;ship=n1;}
                        if(ship.c.subImm(bullet.c).sq()>(ship.ship.half.max()+bullet.size)**2)continue;
                        if(ship.collideBullet(bullet)){
                            ship.hp-=bullet.dmg;
                            node.delete(bullet);
                        }
                    }
                }
            }
        }
    }
    
    players.forEach(p=>{
        p.update();
        if(p.vector.x!==0||p.vector.y!==0){
            p.c.add(p.vector);
            p.updated = true;
        }
    });

    const snapshot = [];
    for(const p of players.values()){
        snapshot.push(...getPlayerDeltaArray(p));
    }
    const s = new Float32Array(snapshot);

    players.forEach(p=>{
        const ws = p.socket;
        ws.send(s.buffer);
    });

    players.forEach(p=>p.updated=false);
},1000/TICK_RATE);
