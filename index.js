require("dotenv").config();

const { PrismaClient } = require("@prisma/client");

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const bcryptSalt = bcrypt.genSaltSync(10);
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const ws = require('ws')
const secret = process.env.JWT_SECRET;
const prisma = new PrismaClient();
const app = express();
app.use(express.json());

app.use(
  cors({
    credentials: true,
    origin: process.env.CLIENT_URL,
  })
);
app.use(cookieParser());




app.get('/',(req,res)=> {
res.json('success')
})
app.get('/user', async (req,res)=> {
    const token = req.cookies?.token;
 
   if (token){ jwt.verify(token, secret , {} , (err,user)=> {
    if (err) return res.sendStatus(401)
     

    return   res.json(user)
    })}
    else {
      res.sendStatus(401)
    }
})



app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;
  const hashpass = bcrypt.hashSync(password, bcryptSalt);
  try {
    if (req.body) {
      const user = await prisma.user.create({
        data: {
          name: name,
          email: email,
          password: hashpass,
        },
      });
      if (user) {
        jwt.sign(
          {
            userid: user.id,
            username: user.name,
          },
          secret,
          {},
          (err, token) => {
        
              console.log(token)
              return res
                .cookie("token", token, { secure: true, sameSite: "none" })
                .status(201)
                .json({ userid: user.id ,username : user.name});
           
          }
        );
      }
    } else {
      console.log("there is an error");
    }
  } catch (error) {
    console.log(error);
  }
});
app.post("/login", async (req, res) => {
  const {email, password } = req.body;

  try {
    if (req.body) {
      const user = await prisma.user.findUnique({
        where : {
            email : email,
        
        }
      })

      if (!user) {
        return res.sendStatus(401)
      }
      const passMatch = await bcrypt.compare(password,user.password)

      if(passMatch) {
        jwt.sign(
            {
              userid: user.id,
              username: user.name,
            },
            secret,
            {},
            (err, token) => {
              if (err) {
                throw new Error('thre is annn error')
              } else {
               return  res
                .cookie("token", token, {sameSite: "none",secure:true})
                .status(200)
                .json({ userid: user.id ,username : user.name})
                 
              }
            }
          );
      } else {
        console.log('user passwod  invalid')
      }
    } else {
      console.log("there is an error loggin in ");
    }
  } catch (error) {
    console.log(error);
  }
});

// messages route 
async function authenticateUser(req) {
  const token = req.cookies?.token;

  if (token){ 
    return new Promise((resolve,reject)=> {
      jwt.verify(token, secret , {} , (err,user)=> {
        if (err) {
          reject(new Error(err))
        }
        else {
          resolve(user)
        }
        }) })
   
 }  else {
  new Error('no valid token')
 }
}

// search user from backend


app.get('/messages/:id', async (req,res) => {
  const { id } = req.params;
  const user = await authenticateUser(req)
  // console.log('user cred',user)
   try {
   
    const messages = await prisma.message.findMany({
      where: {
          OR: [
              {
                  senderId: user.userid,  // Messages sent by the current user
                  receiverId: id  // Messages received by the current user
              },
              {
                  senderId: id,  // Messages sent by the other user
                  receiverId: user.userid  // Messages received by the other user
              }
          ]
      },
      orderBy: {
          createdAt: 'asc' // Optional: Order messages by creation date
      }
  });
  res.send(messages)
}
catch (err) {
   console.log('cant get msg')
  res.sendStatus(404)
}
})

app.get('/logout', (req,res)=> {
  res
  .cookie('token', '', {secure:true, sameSite:'none'})
  .json('logout successfull')

})

// app.get('/mes/:id', async (req,res)=> {
//   const { id } = req.params
//   const data = await prisma.user.findUnique({
//     where : { id : id },
//     include : {
//       message : true
//     }
//   })
//   res.send(data)
// })

const server = app.listen(5000, (req, res) => {
  console.log("server is running on port 5000");
});



const wss = new ws.WebSocketServer({server})
function onlinePeople() {
     
  [...wss.clients].forEach(client => {
    client.send(JSON.stringify({
      online : [...wss.clients].map((c) => ({
        userid : c.userid,
        username : c.username,
      }))
    }))
    
  });
}
 function sendMessageToUser(des,recId,msgId,uid) {
  
    [...wss.clients]
    .filter((u)=> {
     return  u.userid == recId
    })
    .forEach(e => {
  e.send(JSON.stringify({
     type : 'message',
     des: des,
    receiverId : recId,
    msgId : msgId,
    senderId : uid
  

  }))
})};
   
//  }
wss.on('connection', function connection(ws,req) {
   
  ws.isAlive = true
  ws.timer = setInterval(() => {
    ws.ping();
    ws.deathTimer = setTimeout(() => {
      ws.isAlive = false;
      clearInterval(ws.timer)
      ws.terminate()
      onlinePeople()
      console.log('dead')
    }, 1000);
  }, 10000);
 
  ws.on('pong', () => {
    clearTimeout(ws.deathTimer)
   
  })
   
  const cookies = req.headers.cookie
  if(cookies) {
    let token = cookies.split('=')[1] 
    if(token) {
      jwt.verify(token,secret,{}, (err,user)=> {
        if(err) throw err
        const {userid, username} = user;
        ws.userid = userid,
        ws.username = username


      })
      onlinePeople()
    }
  }

    ws.on('error', console.error);
  
    ws.on('message', async (data) => {
      // chat area 
      // const {}= JSON.parse(data)
      // console.log(des, receiverId,ws.userid)
    
      // webrtc area 
        

  let rtcData ;
  try { 
     rtcData = JSON.parse(data)
 } catch (err){
   console.log('Invalid json')
 }

 const { type, des, receiverId, userTo, offer, answer, candidate} = rtcData

 switch (type) {
  case 'offer' : {
    console.log('here is offer');
      [...wss.clients]
      .filter(c => c.userid == userTo)
      .forEach(e => e.send(JSON.stringify({
          type : 'offer',
          offer,
          id : ws.userid
      })))
  } break;
  case 'answer' : {
    
   console.log('here is answer',answer);
      [...wss.clients]
      .filter(c => c.userid == userTo)
      .forEach(e => e.send(JSON.stringify({
          type : 'answer',
          answer,
          id : userTo
      })))
  } break;
  case 'candidate' : {
    console.log('here comes candidates');
      [...wss.clients]
      .filter(c => c.userid == userTo)
      .forEach(e => e.send(JSON.stringify({
          type : 'candidate',
          candidate,
          id : userTo
      })))
  } break;
  case 'message' : {
    try {  
      const message = await prisma.message.create({
        data: {
          des :des,
          senderId : ws.userid,
          receiverId : receiverId
          
        }
       
      }) 
     sendMessageToUser(des,receiverId,message.id,ws.userid)
   
    }
      catch(err) {
        console.log('cant save data', err)
      }

  } break;
  case 'leave' : {
      [wss.clients].forEach(e => e.send(JSON.stringify({
          type : 'leave',
          
      })))
  } break;
  default : { [...wss.clients]
              .filter(c => c.userid = userTo)
              .forEach(e => {
                e.send(JSON.stringify({
                  type : 'error',
                  message : 'Cant connect'
                }))
              })}
 }



      // webrtc area end
    });
   
  
    ws.on("close", (ws,data) => {
      console.log("disconnected", data);
    });
  
onlinePeople()
    
  });

 