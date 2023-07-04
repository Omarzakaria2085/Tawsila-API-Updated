// import express from 'express'
const express = require('express');
require('express-async-errors');
// import user from './src/routes/user'
const user = require('./src/routes/user');
require('dotenv').config()
const app = express()
const cors = require('cors');
const corsOptions ={
    origin:'http://localhost:3000', 
    credentials:true,            //access-control-allow-credentials:true
    optionSuccessStatus:200
}
app.use(cors(corsOptions));
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use('/',user)

app.listen(process.env.PORT)
