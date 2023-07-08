const neo4j = require('neo4j-driver');
const axios = require("axios");
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

function getMetroCost(counter) {
    if (counter == 0) {
        return 0;
    } else if (counter <= 9) {
        return 5;
    } else if (counter <= 16) {
        return 7;
    } else if (counter <= 40) {
        return 10;
    }
}


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
                key: 'AIzaSyAuYs2oF0fyvsFEF9W9eHOMmpRyEFNYT0w'
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
// M Osama: refactored to orderByDistance without redunduncy while keeping the response structure
const orderByDistance = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (start:LOCATION {latitude: ${locationNodeLatitude}, longitude: ${locationNodeLongitude}}),
        (end:LOCATION {latitude: ${destinationNodeLatitude}, longitude: ${destinationNodeLongitude}})
        WITH start, end
        MATCH path = (start)-[:LINE*]->(end)
        WHERE ALL(n IN nodes(path) WHERE size([m IN nodes(path) WHERE m = n]) = 1)
        WITH count(path) AS numberOfAvailablePaths, collect(path) AS paths
        UNWIND paths AS path
        WITH numberOfAvailablePaths, path,
        reduce(cost = 0, r IN relationships(path) | cost + r.cost) AS totalCost,
        reduce(distance = 0, r IN relationships(path) | distance + r.distance) AS totalDistance,
        size(nodes(path)) AS numberOfStops
        RETURN path, numberOfAvailablePaths, totalCost, totalDistance, numberOfStops
        ORDER BY totalDistance, totalCost
    `
    )

    let paths = [];

    //path[]: an array to represent each path in the paths[] as a subarray    
    let path = [];
    // explained in inkodo
    let records = result.records;
    let recordNo, segmentNo;
    let recordsLength = `${records.length}`;
    let latitudes = {};
    let longitudes = {};
    let totalTime = {};
    let metroCounter = 0;
    let metroCosts = 0;
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

    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {

            if (segments[segmentNo].relationship.properties.type === 'metro') {
                metroCounter = segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                metroCounter += metroCounter;
            } else {
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                totalCost += segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
            }


            totalDistance += segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance;

            if (segmentNo == segmentsLength - 1) {
                metroCosts = getMetroCost(metroCounter);
                totalCost += metroCosts;
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

//function to order all available paths by cost given 2 points
// M Osama: refactored to orderByCost without redunduncy while keeping the response structure
const orderByCost = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (start:LOCATION {latitude: ${locationNodeLatitude}, longitude: ${locationNodeLongitude}}),
        (end:LOCATION {latitude: ${destinationNodeLatitude}, longitude: ${destinationNodeLongitude}})
        WITH start, end
        MATCH path = (start)-[:LINE*]->(end)
        WHERE ALL(n IN nodes(path) WHERE size([m IN nodes(path) WHERE m = n]) = 1)
        WITH count(path) AS numberOfAvailablePaths, collect(path) AS paths
        UNWIND paths AS path
        WITH numberOfAvailablePaths, path,
        reduce(cost = 0, r IN relationships(path) | cost + r.cost) AS totalCost,
        reduce(distance = 0, r IN relationships(path) | distance + r.distance) AS totalDistance,
        size(nodes(path)) AS numberOfStops
        RETURN path, numberOfAvailablePaths, totalCost, totalDistance, numberOfStops
        ORDER BY totalCost, totalDistance
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
    let metroCounter = 0;
    let metroCosts = 0;

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

    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {


            if (segments[segmentNo].relationship.properties.type === 'metro') {
                metroCounter = segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                metroCounter += metroCounter;
            } else {
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                totalCost += segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
            }


            totalDistance += segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance;

            if (segmentNo == segmentsLength - 1) {
                metroCosts = getMetroCost(metroCounter);
                totalCost += metroCosts;
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

//function to order all available paths by cost given 2 points
// M Osama: refactored to orderByTime without redunduncy while keeping the response structure
const orderByTime = async (locationNodeLatitude, locationNodeLongitude, destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        MATCH (start:LOCATION {latitude: ${locationNodeLatitude}, longitude: ${locationNodeLongitude}}),
        (end:LOCATION {latitude: ${destinationNodeLatitude}, longitude: ${destinationNodeLongitude}})
        WITH start, end
        MATCH path = (start)-[:LINE*]->(end)
        WHERE ALL(n IN nodes(path) WHERE size([m IN nodes(path) WHERE m = n]) = 1)
        WITH count(path) AS numberOfAvailablePaths, collect(path) AS paths
        UNWIND paths AS path
        WITH numberOfAvailablePaths, path,
        reduce(cost = 0, r IN relationships(path) | cost + r.cost) AS totalCost,
        reduce(distance = 0, r IN relationships(path) | distance + r.distance) AS totalDistance,
        size(nodes(path)) AS numberOfStops
        RETURN path, numberOfAvailablePaths, totalCost, totalDistance, numberOfStops
        ORDER BY totalCost, totalDistance
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
    let metroCounter = 0;
    let metroCosts = 0;

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


    for (recordNo = 0; recordNo < recordsLength; recordNo++) {
        let segments = result.records[recordNo]._fields[0].segments;
        let segmentsLength = `${segments.length}`;
        let totalCost = 0; let totalDistance = 0;
        for (segmentNo = 0; segmentNo < segmentsLength; segmentNo++) {


            if (segments[segmentNo].relationship.properties.type === 'metro') {
                metroCounter = segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                metroCounter += metroCounter;
            } else {
                path.push({
                    name: segments[segmentNo].start.properties.name,
                    latitude: segments[segmentNo].start.properties.latitude,
                    longitude: segments[segmentNo].start.properties.longitude,
                    cost: segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost,
                    distance: segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance,
                    transportationType: segments[segmentNo].relationship.properties.type,
                    lineNumber: segments[segmentNo].relationship.properties.name
                });
                totalCost += segments[segmentNo].relationship.properties.cost.low ?? segments[segmentNo].relationship.properties.cost;
            }


            totalDistance += segments[segmentNo].relationship.properties.distance.low ?? segments[segmentNo].relationship.properties.distance;

            if (segmentNo == segmentsLength - 1) {
                metroCosts = getMetroCost(metroCounter);
                totalCost += metroCosts;
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



// add new route
const addNewRoute = async (
    locationNodeLatitude,
    locationNodeLongitude,
    destinationNodeLatitude,
    destinationNodeLongitude,
    cost,
    lineName,
    type
) => {
    // check if the from & to points already exist
    const result = await session.run(
        `MATCH (n1:LOCATION {latitude: ${locationNodeLatitude},longitude:${locationNodeLongitude}})
        -[r:LINE {cost: ${cost}, distance: 0.7,name: "${lineName}", type: "${type}"}]->
        (n2:LOCATION {latitude: ${destinationNodeLatitude},longitude:${destinationNodeLongitude}})
        RETURN n1,r,n2`);
    const exists = result.records.length > 0; // check if query returned any records
    if (exists) {
        return false; // if node already exists, return false
    } else {
        try {
            // nearby
            const nearby = {
                method: 'POST',
                url: 'https://tawsila-api.onrender.com/nearby',
                headers: {
                    'content-type': 'application/json',
                    'Accept-Encoding': 'null',
                },
                data: `{"Location":"${locationNodeLatitude}, ${locationNodeLongitude}","Destination":"${destinationNodeLatitude}, ${destinationNodeLongitude}"}`,
            };

            const response = await axios.request(nearby);
            const nearbyArrayLength = response.data.length;
            const nearbyArray = response.data;
            const nearbyLocations = [];
            const nearbyDestinations = [];

            // get the closest places to both loc & dest
            for (let i = 0; i < nearbyArrayLength; i++) {
                if (nearbyArray[i].inputField === 'Location') {
                    nearbyLocations.push(nearbyArray[i]);
                    nearbyLocations.sort((a, b) => a.distance - b.distance);
                } else if (nearbyArray[i].inputField === 'Destination') {
                    nearbyDestinations.push(nearbyArray[i]);
                }
            }

            // search inside nearbyLocations, if you found any distance =0, take it as your location, else take the shortest distance
            let newLocationLat;
            let newLocationLong;
            let location;
            let locName;
            let locWalkingDistance;
            for (let i = 0; i < nearbyLocations.length; i++) {
                if (nearbyLocations[i].distance === 0) {
                    newLocationLat = nearbyLocations[i].latitude;
                    newLocationLong = nearbyLocations[i].longitude;
                    location = `${newLocationLat},${newLocationLong}`;
                    locName = nearbyLocations[i].name;
                    // search in the orderByCost query using them by replacing only the loc

                    break;
                } else if (nearbyLocations[i].distance !== 0) {
                    newLocationLat = nearbyLocations[0].latitude;
                    newLocationLong = nearbyLocations[0].longitude;
                    location = `${newLocationLat},${newLocationLong}`;
                    locName = nearbyLocations[0].name;
                    locWalkingDistance = nearbyLocations[0].distance;
                    // search in the orderByCost query using them by replacing only the loc
                }
            }

            // search inside nearbyDestinations, if you found any distance =0, take it as your destination, else take the shortest distance
            let newDestinationLat;
            let newDestinationLong;
            let destination;
            let destName;
            let destWalkingDistance;
            for (let i = 0; i < nearbyDestinations.length; i++) {
                if (nearbyDestinations[i].distance === 0) {
                    newDestinationLat = nearbyDestinations[i].latitude;
                    newDestinationLong = nearbyDestinations[i].longitude;
                    destination = `${newDestinationLat},${newDestinationLong}`;
                    destName = nearbyDestinations[i].name;
                    // search in the orderByCost query using them by replacing only the dest

                    break;
                } else if (nearbyDestinations[i].distance !== 0) {
                    newDestinationLat = nearbyDestinations[0].latitude;
                    newDestinationLong = nearbyDestinations[0].longitude;
                    destination = `${newDestinationLat},${newDestinationLong}`;
                    destName = nearbyDestinations[0].name;
                    destWalkingDistance = nearbyDestinations[0].distance;
                    // search in the orderByCost query using them by replacing only the dest
                }
            }

            // add new route
            const result = await session.run(
                `MATCH (n1:LOCATION {latitude: ${newLocationLat},longitude: ${newLocationLong}}),
                        (n2:LOCATION {latitude: ${newDestinationLat},longitude: ${newDestinationLong}})
                  CREATE (n1)-[r:LINE {cost: ${cost}, distance: 0.7,name: "${lineName}", type: "${type}"}]->(n2)`);

            //   console.log(result);
            //   console.log('HOLA! nearby is used');
            console.log("newLocationLat:", newLocationLat);
            console.log("newLocationLong:", newLocationLong);
            console.log("newDestinationLat", newDestinationLat);
            console.log("newDestinationLong", newDestinationLong);
            console.log("**********************************");
            console.log("nearbyLocations", nearbyLocations);
            console.log("nearbyDestinations", nearbyDestinations);
            return result;
        } catch (error) {
            console.log(error);
        }
    }


};





/* 
to return the created relationship between the 2 nodes:
--------------------------------------------------------
MATCH (a:LOCATION {latitude: 29.9617319,longitude:31.30579410000001})-[r:LINE]->(b:LOCATION {latitude: 30.0154402,longitude:31.2118712})
return a,b,r

MATCH (a:LOCATION {latitude: 29.961888,longitude:31.305797})-[r:LINE]->(b:LOCATION {latitude:  30.0154495 ,longitude:31.212008})
return a,b,r

to delete the relationship between the 2 nodes:
-----------------------------------------------
MATCH (a:LOCATION {latitude: 29.9617319,longitude:31.30579410000001})-[r:LINE]->(b:LOCATION {latitude: 30.0154402,longitude:31.2118712})
DELETE r

MATCH (a:LOCATION {latitude: 29.961888,longitude:31.305797})-[r:LINE]->(b:LOCATION {latitude: 30.01989 ,longitude:31.2115787})
DELETE r

to return the created relationship:
--------------------------------
MATCH (n1:LOCATION)-[r:LINE {name: 'ههههه'}]->(n2:LOCATION)
RETURN n1,r,n2

to delete the created relationship:
-----------------------------------
MATCH (:LOCATION)-[r:LINE {name: 'ههههه'}]->(:LOCATION)
DELETE r

to check if the given point exists in database:
-----------------------------------------------
MATCH (n1:LOCATION {latitude: 29.9617319,longitude:31.30579410000001})-[r:LINE {distance:0.7 ,type:"microbus", cost:9 , name:"ههههه" }]->(n2:LOCATION {latitude: 30.0154402,longitude:31.2118712})
RETURN n1,r,n2


*/
module.exports = {
    findAll,
    orderByCost,
    orderByDistance,
    orderByTime,
    nearby,
    addNewRoute
}