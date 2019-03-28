import fs from 'fs';
//const fetch = require('node-fetch');
//import axios from 'axios';
import n3 from 'n3';
//const https = require("https");

const { DataFactory } = n3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;


//help needed
//let rootca = require('ssl-root-cas/latest').create();
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
//process.env.NODE_EXTRA_CA_CERTS=[rootca];

export default class FragmentStore{
    constructor(){
        this.lastPreviousUrl = null;
        this.lastLatest = "0";
        this.DATASET_URL = 'https://lodi.ilabt.imec.be/observer/rawdata/latest';
    }

    download(_url){
        console.log("\x1b[32m","downloading: "+_url,"\x1b[0m");
        //const caAgent = new https.Agent({ca: rootca});
        return new Promise((resolve,reject) => {

            fetch(_url)
                .then(function(response) {
                    resolve(response.text());
                })
                .catch(err => {console.log("\x1b[31m\x1b[47m",err,"\x1b[0m"); reject(err)});
        });
    }

    // download2(_url){
    //     console.log("\x1b[32m","downloading: "+_url,"\x1b[0m");
    //     //const caAgent = new https.Agent({ca: rootca});
    //     return new Promise((resolve,reject) => {
    //
    //         axios.get(_url)
    //             .then(function(response) {
    //                 resolve(response.data);
    //             })
    //             .catch(err => {console.log("\x1b[31m\x1b[47m",err,"\x1b[0m"); reject(err)});
    //     });
    // }

    parseAndStoreQuads(_doc) {
        return new Promise(resolve => {
            const parser = new n3.Parser();
            const store = n3.Store();
            parser.parse(_doc, (error, quad, prefixes) => {
                if (quad)
                    store.addQuad(quad);
                else
                    return resolve(store);
            });
        })
    }

    async sleep(milliseconds){
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    //latest -> green, prev: blue
    async compareAndSave(latest){
        console.log("comparing");
        //console.log(latest);
        if(this.lastLatest){
            if(latest.length != this.lastLatest.length){
                //save latest to disk
                this.lastLatest = latest;
                console.log("\x1b[36m","difference latest","\x1b[0m");
                let currentTimeMillis = Date.now();
                fs.writeFile("./latest/fragment_"+currentTimeMillis, latest, function(err) {
                    if(err){
                        console.log(err);
                    }
                    console.log("\x1b[36m","latest saved","\x1b[0m");
                });
                //check previous if saved
                let store = await this.parseAndStoreQuads(latest);

                let prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
                let oldLastPreviousUrl = this.lastPreviousUrl;
                if(prev){
                    this.lastPreviousUrl = prev.object.value;
                }
                while (prev && oldLastPreviousUrl !== prev.object.value) {
                    try {
                        let doc = await this.download(prev.object.value);

                        console.log("\x1b[33m","downloaded previous","\x1b[0m");
                        store = await this.parseAndStoreQuads(doc);

                        let name = /time=(.*)/.exec(prev.object.value)[1].replace(/\:/g,"_").replace(/\./g,"_") + ".trig";
                        //console.log("\x1b[31m",name,"\x1b[0m");
                        fs.writeFile("./previous/fragment_"+name, doc, function(err) {
                            if(err){
                                console.log(err);
                            }
                            console.log("\x1b[33m","previous saved: "+name,"\x1b[0m");
                        });

                        prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
                    } catch(e){
                        console.log("\x1b[31m",e,"\x1b[0m");
                    }
                }
                if(!prev) {
                    console.log("\x1b[31m","No prev defined","\x1b[0m");
                }
            }
        }
        else {
            this.lastLatest = latest;
        }
    }

    start(){
        console.log("running");
        //setInterval(() => { //changed interval to every 3 hours get all previous files
            //try{
            this.download(this.DATASET_URL)
                .then((res) => { console.log("\x1b[36m","downloaded latest fragment","\x1b[0m"); return res})
                .then((res) => this.compareAndSave(res))
                .catch(e => console.log(e));
            //this.compareAndSave(res);
            // console.log("fragment");
            // console.log(doc);
            // this.sleep(10000);
            // }
            //catch(e){
            //     console.log(e);
            // }
            console.log("\x1b[35m","ready for next latest","\x1b[0m");
        //}, 10800000); //3 hour = 10800000 seconds

        //prevent termination of program when not using interval
        setInterval(() => {
            console.log("...............running:"+Date.now()+"...............");
        }, 10000);
    }

}

// let fragmentStore = new FragmentStore();
// fragmentStore.start();
