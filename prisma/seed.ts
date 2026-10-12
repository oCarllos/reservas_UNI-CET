import { PrismaClient } from '@prisma/client'; import bcrypt from 'bcryptjs';
const db=new PrismaClient();
async function main(){
 const email=process.env.ADMIN_EMAIL, password=process.env.ADMIN_INITIAL_PASSWORD;
 if(!email||!password||password.length<12) throw new Error('Configure ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD (mínimo 12 caracteres) antes do seed.');
 await db.user.upsert({where:{email},update:{},create:{fullName:'Administrador TI',email,role:'ADMIN',passwordHash:await bcrypt.hash(password,12),mustChangePassword:true}});
 const labs=[['Laboratório Azul','#5577c8'],['Laboratório Areia','#b89a6a'],['Laboratório Magenta','#b14f85'],['Laboratório Verde','#54896b'],['Laboratório Laranja','#ce8051'],['Laboratório Cinza','#78828d']];
 for(const [name,color] of labs) await db.laboratory.upsert({where:{code:name.slice(-4).toUpperCase()},update:{},create:{name,code:name.slice(-4).toUpperCase(),color,capacity:30,computerCount:30,responsible:'Setor de Tecnologia'}});
 await db.scheduleSetting.upsert({where:{id:1},update:{},create:{id:1}});
 if(!await db.blockedPeriod.count()) await db.blockedPeriod.create({data:{startTime:'12:00',endTime:'14:00',reason:'Intervalo'}});
}
main().finally(()=>db.$disconnect());
