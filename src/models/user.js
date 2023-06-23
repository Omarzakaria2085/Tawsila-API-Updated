const neo4j = require('neo4j-driver');
require('dotenv').config()
const {
    url,
    db_username,
    db_password,
    database,
} = process.env
const driver = neo4j.driver(url, neo4j.auth.basic(db_username, db_password));
const session = driver.session({ database });


const { Client } = require('@googlemaps/google-maps-services-js');

const googleMapsClient = new Client({});

// const axios = require('axios');

// async function calculateDistanceAndTime(originLat, originLng, destinationLat, destinationLng) {
//     try {
//         const origin = { lat: originLat, lng: originLng };
//         const destination = { lat: destinationLat, lng: destinationLng };

//         const request = {
//             params: {
//                 origin: origin,
//                 destination: destination,
//                 mode: 'transit',
//                 transit_mode: 'bus',
//                 key: 'AIzaSyDERewK8rwT0KjgVnsWVNWf0nj0OLQBo2U'
//             }
//         };

//         const response = await axios.get('https://maps.googleapis.com/maps/api/directions/json', request);
//         const routes = response.data.routes;

//         if (routes.length > 0) {
//             const duration = routes[0].legs[0].duration.text;
//             return duration;
//         } else {
//             throw new Error('No routes found');
//         }
//     } catch (error) {
//         // console.error(error);
//         // throw new Error('Request failed');
//     }
// }


//function to return all database nodes
const findAll = async () => {
    const result = await session.run(`MATCH (n) RETURN n`)
    return { allNodes: result.records.map(i => i.get('n').properties) }
}


async function calculateDistanceAndTime(originLat, originLng, destinationLat, destinationLng) {
    try {
        const response = await googleMapsClient.directions({
            params: {
                origin: `${originLat},${originLng}`,
                destination: `${destinationLat},${destinationLng}`,
                mode: 'transit',
                transit_mode: 'bus',
                key: 'AIzaSyDERewK8rwT0KjgVnsWVNWf0nj0OLQBo2U'
            }
        });
        if (response.data.status === 'OK') {
            const route = response.data.routes[0];
            const duration = route.legs[0].duration.text;
            return parseFloat(duration.split(' '));
        } else {
            return -1;
        }
    } catch (error) {
        // console.error('An error occurred:', error);
        return -1;
    }
}





//function to order all available paths by distance given 2 points
const orderByDistance = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),(n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        p =(n1)-[:LINE*]->(n2)
        With count(*) as numberOfAvailablePaths
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),(n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        path =(n1)-[:LINE*]->(n2)
        return path,numberOfAvailablePaths,reduce(s=0, i in relationships(path) | s+i.cost ) as totalCost,reduce(s=0, i in relationships(path) | s+i.distance ) as totalDistance,size(nodes(path)) as numberOfStops 
        order By totalDistance,totalCost
    `
    )

    let paths = [];

    //path[]: an array to represent each path in the paths[] as a subarray    
    let path = [];
    // explained in inkodo
    let records = result.records;
    let recordNo, segmentNo;
    let recordsLength = `${records.length}`;

    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {
            path.push({
                name: segments[segmentNo].start.properties.name,
                latitude: segments[segmentNo].start.properties.latitude,
                longitude: segments[segmentNo].start.properties.longitude,
                cost: segments[segmentNo].relationship.properties.cost.low,
                distance: segments[segmentNo].relationship.properties.distance,
                transportationType: segments[segmentNo].relationship.properties.type,
                lineNumber: segments[segmentNo].relationship.properties.name
            });
            totalCost += segments[segmentNo].relationship.properties.cost.low;
            totalDistance += segments[segmentNo].relationship.properties.distance;
            if (segmentNo == segmentsLength - 1) {
                path.push({
                    name: segments[segmentNo].end.properties.name,
                    latitude: segments[segmentNo].end.properties.latitude,
                    longitude: segments[segmentNo].end.properties.longitude,
                    totalCost: totalCost,
                    totalDistance: totalDistance
                });
            }
        }
        paths.push(path);
        path = [];
    }
    return paths;
}

//function to order all available paths by cost given 2 points
const orderByCost = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),
        (n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        p =(n1)-[:LINE*]->(n2)
        With count(*) as numberOfAvailablePaths
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),
        (n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        path =(n1)-[:LINE*]->(n2)
        return path,numberOfAvailablePaths,
        reduce(s=0, i in relationships(path) | s+i.cost ) as totalCost,
        reduce(s=0, i in relationships(path) | s+i.distance ) as totalDistance,
        size(nodes(path)) as numberOfStops 
        order By totalCost,totalDistance
    `
    )

    // paths[]: an array to store the stops of all paths combined together in order but with no subarrays     
    let paths = [];

    //path[]: an array to represent each path in the paths[] as a subarray    
    let path = [];
    let records = result.records;
    let recordNo, segmentNo;
    let recordsLength = `${records.length}`;

    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {
            path.push({
                name: segments[segmentNo].start.properties.name,
                latitude: segments[segmentNo].start.properties.latitude,
                longitude: segments[segmentNo].start.properties.longitude,
                cost: segments[segmentNo].relationship.properties.cost.low,
                distance: segments[segmentNo].relationship.properties.distance,
                transportationType: segments[segmentNo].relationship.properties.type,
                lineNumber: segments[segmentNo].relationship.properties.name
            });
            totalCost += segments[segmentNo].relationship.properties.cost.low;
            totalDistance += segments[segmentNo].relationship.properties.distance;
            if (segmentNo == segmentsLength - 1) {
                path.push({
                    name: segments[segmentNo].end.properties.name,
                    latitude: segments[segmentNo].end.properties.latitude,
                    longitude: segments[segmentNo].end.properties.longitude,
                    totalCost: totalCost,
                    totalDistance: totalDistance
                });
            }
        }
        paths.push(path);
        path = [];
    }
    return paths;
}




//function to order all available paths by cost given 2 points
const orderByTime = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),
        (n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        p =(n1)-[:LINE*]->(n2)
        With count(*) as numberOfAvailablePaths
        MATCH (n1:LOCATION {latitude:${locationNodeLatitude},longitude:${locationNodeLongitude}} ),
        (n2:LOCATION {latitude:${destinationNodeLatitude},longitude:${destinationNodeLongitude}}),
        path =(n1)-[:LINE*]->(n2)
        return path,numberOfAvailablePaths,
        reduce(s=0, i in relationships(path) | s+i.cost ) as totalCost,
        reduce(s=0, i in relationships(path) | s+i.distance ) as totalDistance,
        size(nodes(path)) as numberOfStops 
        order By totalCost,totalDistance
    `
    )

    // paths[]: an array to store the stops of all paths combined together in order but with no subarrays     
    let paths = [];

    //path[]: an array to represent each path in the paths[] as a subarray    
    let path = [];
    let records = result.records;
    let recordNo, segmentNo;
    let recordsLength = `${records.length}`;
    let latitudes = {};
    let longitudes = {};
    let totalTime = {};
    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        const key = recordNo;
        latitudes[key] = [];
        longitudes[key] = [];
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {
            latitudes[key].push(segments[segmentNo].start.properties.latitude);
            longitudes[key].push(segments[segmentNo].start.properties.longitude);
            if (segmentNo == segmentsLength - 1) {
                latitudes[key].push(segments[segmentNo].end.properties.latitude);
                longitudes[key].push(segments[segmentNo].end.properties.longitude);
            }
        }
    }
    for (let pathNo = 0; pathNo < Object.keys(latitudes).length; pathNo++) {
        let latitudesArray = latitudes[pathNo];
        let longitudesArray = longitudes[pathNo];
        totalTime[pathNo] = 0;
        const promises = [];
        for (let i = 0; i < latitudesArray.length - 1; i++) {
            const originLat = latitudesArray[i];
            const originLng = longitudesArray[i];
            const destinationLat = latitudesArray[i + 1];
            const destinationLng = longitudesArray[i + 1];
            promises.push(
                calculateDistanceAndTime(originLat, originLng, destinationLat, destinationLng)
                    .then(duration => {
                        totalTime[pathNo] += duration;
                    })
                    .catch(error => {
                        console.error('An error occurred:', error);
                    })
            );
        }

        await Promise.all(promises);

    }

    const sortedValues = Object.values(totalTime).sort((a, b) => a - b);

    totalTime = sortedValues.reduce((result, value, index) => {
        result[index] = value;
        return result;
    }, {});


    // console.log(totalTime);

    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {
            path.push({
                name: segments[segmentNo].start.properties.name,
                latitude: segments[segmentNo].start.properties.latitude,
                longitude: segments[segmentNo].start.properties.longitude,
                cost: segments[segmentNo].relationship.properties.cost.low,
                distance: segments[segmentNo].relationship.properties.distance,
                transportationType: segments[segmentNo].relationship.properties.type,
                lineNumber: segments[segmentNo].relationship.properties.name
            });
            totalCost += segments[segmentNo].relationship.properties.cost.low;
            totalDistance += segments[segmentNo].relationship.properties.distance;
            if (segmentNo == segmentsLength - 1) {
                path.push({
                    name: segments[segmentNo].end.properties.name,
                    latitude: segments[segmentNo].end.properties.latitude,
                    longitude: segments[segmentNo].end.properties.longitude,
                    totalCost: totalCost,
                    totalDistance: totalDistance,
                    totalTime: totalTime[recordNo]
                });
            }
        }
        paths.push(path);
        path = [];
    }
    return paths;
}







//function to get the nearby locations
const nearby = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (l:LOCATION)
        WHERE point.distance(point({latitude:${locationNodeLatitude}, longitude: ${locationNodeLongitude}}), point({latitude: l.latitude, longitude: l.longitude})) <= 2000
        RETURN l.name, l.latitude, l.longitude, point.distance(point({latitude: ${locationNodeLatitude}, longitude: ${locationNodeLongitude}}), point({latitude: l.latitude, longitude: l.longitude})) AS Distance, "Location" AS input
        ORDER BY Distance
        UNION ALL
        MATCH (l:LOCATION)
        WHERE point.distance(point({latitude: ${destinationNodeLatitude}, longitude: ${destinationNodeLongitude}}), point({latitude: l.latitude, longitude: l.longitude})) <= 2000
        RETURN l.name, l.latitude, l.longitude, point.distance(point({latitude: ${destinationNodeLatitude}, longitude: ${destinationNodeLongitude}}), point({latitude: l.latitude, longitude: l.longitude})) AS Distance, "Destination" AS input
        ORDER BY Distance
    `
    )
    let nearbyPlaces = [];
    let nearbyPlacesLength = result.records.length;
    for (let i = 0; i < nearbyPlacesLength; i++) {
        nearbyPlaces.push({
            name: result.records[i]._fields[0],
            latitude: result.records[i]._fields[1],
            longitude: result.records[i]._fields[2],
            distance: result.records[i]._fields[3],
            inputField: result.records[i]._fields[4]
        })
    }
    return nearbyPlaces;
}

module.exports = {
    findAll,
    orderByCost,
    orderByDistance,
    orderByTime,
    nearby
}



/*

      let nearbyArray = response.data;
      let latitudes = {};
      let longitudes = {};
      let totalTime = {};

      for (let i = 0; i < nearbyArray.length; i++) {
        const innerArray = nearbyArray[i];
        const key = i;

        // Add the first element of each inner array to the array of the corresponding index in the object
        latitudes[key] = [];
        longitudes[key] = [];
        for (let j = 0; j < innerArray.length; j++) {
          const element = innerArray[j];

          latitudes[key].push(element.latitude);
          longitudes[key].push(element.longitude);
        }
      }

      for(let pathNo=0 ; pathNo<latitudes.length -1 ; pathNo++){
        
        let latitudesArray = latitudes[pathNo]; 
        let longitudesArray = longitudes[pathNo]; 
        
        for (let i = 0; i < latitudesArray.length - 1; i++) {
          const originLat = latitudesArray[i];
          const originLng = longitudesArray[i];
          const destinationLat = latitudesArray[i + 1];
          const destinationLng = longitudesArray[i + 1];
      
          calculateDistanceAndTime(originLat, originLng, destinationLat, destinationLng, function (duration) {
            totalTime[pathNo] += duration
          });
        }
      
      }







            let nearbyArray = response.data;
      let latitudes = {};
      let longitudes = {};
      let totalTime = {};
      // get the closest places to both loc & dest

      for (let i = 0; i < nearbyArray.length; i++) {
        const innerArray = nearbyArray[i];
        const key = i;

        // Add the first element of each inner array to the array of the corresponding index in the object
        latitudes[key] = [];
        longitudes[key] = [];
        for (let j = 0; j < innerArray.length; j++) {
          const element = innerArray[j];

          latitudes[key].push(element.latitude);
          longitudes[key].push(element.longitude);
        }
      }

      for(let pathNo=0 ; pathNo<latitudes.length -1 ; pathNo++){
        
        let latitudesArray = latitudes[pathNo]; 
        let longitudesArray = longitudes[pathNo]; 
        
        for (let i = 0; i < latitudesArray.length - 1; i++) {
          const originLat = latitudesArray[i];
          const originLng = longitudesArray[i];
          const destinationLat = latitudesArray[i + 1];
          const destinationLng = longitudesArray[i + 1];
      
          calculateDistanceAndTime(originLat, originLng, destinationLat, destinationLng, function (duration) {
            totalTime[pathNo] += duration
          });
        }
      
      }

*/