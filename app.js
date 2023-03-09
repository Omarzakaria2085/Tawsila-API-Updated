// import express from 'express'
const express = require('express');
require('express-async-errors');
// import user from './src/routes/user'
const user = require('./src/routes/user');
require('dotenv').config()
const app = express()
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use('/',user)

app.listen(process.env.PORT)
