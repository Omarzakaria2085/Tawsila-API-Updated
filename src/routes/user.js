const { Router } = require('express');
const userModel = require('../models/user');
const user = Router()
const joi = require('joi');

user.get('/', async (req, res) => {
    const result = await userModel.findAll()
    res.json(result)
})
user.post('/orderByDistance', async (req, res) => {
    const Location = req.body.Location;
    const Destination =req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');
    const result = await userModel.orderByDistance(locLat ,locLong,destLat,destLong);
    res.json(result);
})

user.post('/orderByCost', async (req, res) => {
    const Location = req.body.Location;
    const Destination = req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');
    const result = await userModel.orderByCost(parseFloat(locLat) ,parseFloat(locLong),parseFloat(destLat),parseFloat(destLong));
    res.json(result);
});
user.post('/nearby', async (req, res) => {
    const Location = req.body.Location;
    const Destination = req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');
    const result = await userModel.nearby(parseFloat(locLat) ,parseFloat(locLong),parseFloat(destLat),parseFloat(destLong));
    res.json(result);
});


// export default user
module.exports = user