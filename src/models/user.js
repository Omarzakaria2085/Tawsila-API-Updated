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

//function to return all database nodes
const findAll = async () => {
    const result = await session.run(`MATCH (n) RETURN n`)
    return { allNodes: result.records.map(i => i.get('n').properties) }
}

//function to order all available paths by distance given 2 points
const orderByDistance = async (locationNodeLatitude,locationNodeLongitude,destinationNodeLatitude, destinationNodeLongitude) => {

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
const orderByCost = async (locationNodeLatitude,locationNodeLongitude,destinationNodeLatitude, destinationNodeLongitude) => {

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

//function to get the nearby locations
const nearby = async (locationNodeLatitude,locationNodeLongitude,destinationNodeLatitude, destinationNodeLongitude) => {

    let result = await session.run(
        `
        WITH ${locationNodeLatitude} as locLat, ${locationNodeLongitude} as locLong , "Location" as input
        MATCH (l:LOCATION)
        WHERE point.distance(point({latitude: locLat, longitude: locLong}), point({latitude: l.latitude, longitude: l.longitude})) < 200
        RETURN l.name,l.latitude, l.longitude,point.distance(point({latitude: locLat, longitude: locLong}), point({latitude: l.latitude, longitude: l.longitude})) AS Distance, input
        union all
        WITH ${destinationNodeLatitude} as destLat, ${destinationNodeLongitude} as destLong, "Destination" as input
        MATCH (l:LOCATION)
        WHERE point.distance(point({latitude: destLat, longitude: destLong}), point({latitude: l.latitude, longitude: l.longitude})) < 200
        RETURN l.name,l.latitude, l.longitude,point.distance(point({latitude: destLat, longitude: destLong}), point({latitude: l.latitude, longitude: l.longitude})) AS Distance, input
        ORDER BY point.distance(point({latitude: destLat, longitude: destLong}), point({latitude: l.latitude, longitude: l.longitude}))
    `
        )
    let nearbyPlaces=[];
    let nearbyPlacesLength = result.records.length;
    for (let i = 0 ; i < nearbyPlacesLength ; i++){
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
    nearby
}

