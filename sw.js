const VERSION ="v4";

//Offline resource list -- what you want access to when you're offline 
const APP_STATIC_RESOURCES = [
    "index.html", 
    "style.css",
    "app.js",
    "vacationtracker.json",
    "assets/icons/icon-512x512.png",
];

const CACHE_NAME = `vacation-tracker-${VERSION}`;

/* handle the install event and retrieve and store the file listed for the cache */
self.addEventListener("install", (event)=>{
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            cache.addAll(APP_STATIC_RESOURCES);
        })
    );
});

/* 
    use the activate event to delte any old caches so we don't run out of the space. We're going to delete all but the current one. 
    Then set the service worker as the controller for our app (PWA)
*/

self.addEventListener("activate", (event)=>{
    event.waitUntil(
        (async () => {
            //get the names of existing caches
            const names = await caches.keys();

            //iterate thorugh the list and check each one to see if it's the current cache
            // delete if not

            await Promise.all(
                names.map((name)=>{
                    if (name !== CACHE_NAME){
                        return caches.delete(name);
                    }
                })
            ); //promise all

            //use the claim() method of client's interface to enable our service worker as the controller
            await clients.claim();
        })
    ); //wait until
});

/*
    use the fetch event to intercept requests to the server so we can serve up our cached pages or respond wiht an error or 404
*/

self.addEventListener("fetch", (event)=>{
    event.respondWith(
        (async () => {
        //try to get the resouce from the cache 
        const cachedResponse = await cache.match(event.request);

        if(cachedResponse){
            return cachedResponse;
        }

        //if not in the cache, try to fetch from the network 
        try{

            const networkResponse = await fetch(event.request);
            //cache the new response for future use
            cache.put(event.request, networkResponse.clone());

            return networkResponse;

        } catch(error){ //if it isn't there
            console.error("Fetch failed; returning offline page instead.", error);

            //if the request is for a page, return index.html as a fallback
            if(event.request.mode === "navigate"){
                return cache.match("/index.html");
            }

            //for everything else, we're just going to throw an error 
            //you might want to return a default offline asset instead
            throw error;
        }

        })()
    );//respond with
});//fetch

// //send a message to the client - we will use to update data later 
// function sendMessageToPWA(message){
//     self.clients.matchAll().then((clients)=> {
//         clients.array.forEach((client) => {
//             client.postMessage(message);
//         });
//     });
// }

// //send message every 10 seconds 
// setInterval(()=>{
//     sendMessageToPWA({
//         type: "update", data: "New Data Available"});
// }, 10000);

// //listen for messages from the app 
// self.addEventListener("Message", (event)=>{
//     console.log("Service Worker received a message", event.data);

//     //you can respond back if needed 
//     event.source.postMessage({
//         type: "Repsonse",
//         data: "Message received by sw"
//     });
// });

//create a broadcast channel - name here needs to match the name in the app
const channel = new BroadcastChannel("pwa_channel");

//listen for messages 
channel.onmessage = (event) => {
    console.log("Received message in SW:", event.data);
    
    //ECHO THE MESSAGE BACK TO THE PWA  
    channel.postMessage("Service Worker received:" + event.data);
};

//open or create the database
let db;
const dbName = "SyncDatabase";
const request =indexedDB.open(dbName, 1); //name and version needs to match app.js

request.onerror = function (event) {
    console.error("Database ERROR: " + event.target.error);
};

request.onsuccess = function(event){
    //now we actually have our db
    db = event.target.result;
    console.log("Database opened successfully in service worker");
};

self.addEventListener("sync", function(event){
    if(event.tag === "send-data"){
        event.waitUntil(sendDataToServer());
    }
});

function sendDataToServer(){ //no parameters because we'll get that from the database
    return getAllPendingData().then(function(dataList){
        return Promise.all(
            dataList.map(function(item){
                //simulate sending the data to the server
                return new PromiseRejectionEvent((resolve, reject)=>{
                    setTimeout(()=>{
                        if (Math.random() > 0.1){ //90% success rate
                            console.log("Data sent successfully: " , item.data);
                            resolve(item.id);
                        }else{
                            console.log("Failed to send data: " , item.data);
                            reject(new Error("Failed to send data"));
                        }
                    }, 1000);
                }).then(function(){
                    //if successful, remove the item from the db
                    return removeDataFromIndexDB(item.id);
                });
            })
        )
    })
}; //sendDataToServer

function getAllPendingData(){
    return new Promise((resolve, reject) =>{
        //transcation to read data from db
        const transaction = db.transaction(["pendingData"], "readonly");
        const objectStore = transaction.objectStore("pendingData");
        const request = objectStore.getAll();

        request.onsuccess = function(event){
            resolve(event.target.result);
        };

        request.onerror = function(event){
            reject("Error fetching data: " + event.target.error);
        };

    });
}
  