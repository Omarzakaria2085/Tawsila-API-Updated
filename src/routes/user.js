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

    // Get the paths sorted by Distance
    const result = await userModel.orderByDistance(locLat ,locLong,destLat,destLong);
    res.json(result);
})

user.post('/orderByTime', async (req, res) => {
  const Location = req.body.Location;
  const Destination =req.body.Destination;
  const [locLat,locLong] = Location.split(',');
  const [destLat,destLong] = Destination.split(',');

  // Get the paths sorted by Distance
  const result = await userModel.orderByTime(locLat ,locLong,destLat,destLong);
  res.json(result);
})


user.post('/orderByCost', async (req, res) => {
    const Location = req.body.Location;
    const Destination = req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');

    // Get the paths sorted by Cost
    const result = await userModel.orderByCost(parseFloat(locLat) ,parseFloat(locLong),parseFloat(destLat),parseFloat(destLong));
    res.json(result);
});

user.post('/nearby', async (req, res) => {
    const Location = req.body.Location;
    const Destination = req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');

    // Get the nearest points to the given locations
    const result = await userModel.nearby(parseFloat(locLat) ,parseFloat(locLong),parseFloat(destLat),parseFloat(destLong));
    res.json(result);
});

user.post('/nearestPaths', async (req, res) => {
    const Location = req.body.Location;
    const Destination = req.body.Destination;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');
  
    // Get the nearest points to the given locations
    const nearestPoints = await userModel.nearby(parseFloat(locLat), parseFloat(locLong), parseFloat(destLat), parseFloat(destLong));

    // Get the paths sorted by Cost
    const result = await userModel.orderByCost(getLatLong(nearestPoints).locationLat, getLatLong(nearestPoints).locationLong, getLatLong(nearestPoints).destinationLat,getLatLong(nearestPoints).destinationLong);
  
    res.json(result);
  });

user.post('/addNewRoute', async(req, res)=>{
  const Location = req.body.Location;           //latitude,longitude
    const Destination = req.body.Destination;  //latitude,longitude
    let Cost =req.body.Cost;
    const LineName = req.body.LineName;
    const Type = req.body.Type;
    const [locLat,locLong] = Location.split(',');
    const [destLat,destLong] = Destination.split(',');

    if(Cost == ""){
      Cost = 7;
  }
    const result = await userModel.addNewRoute(locLat ,locLong,destLat,destLong,Cost,LineName,Type);
    res.json(result);
});

  // Return latLng of nearest location & destination
  function getLatLong(json) {
    const location = json.find(obj => obj.inputField === "Location");
    const destination = json.find(obj => obj.inputField === "Destination");
    return {
      locationLat: location.latitude,
      locationLong: location.longitude,
      destinationLat: destination.latitude,
      destinationLong: destination.longitude
    };
  }

// export default user
module.exports = user