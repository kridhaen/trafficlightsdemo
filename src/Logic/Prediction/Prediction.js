

import React, { Component } from 'react';
import n3 from 'n3';
import { Table } from "semantic-ui-react";


const { DataFactory } = n3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

class Prediction extends Component {

    constructor(props){
        super(props);
        this.DATASET_URL = 'https://lodi.ilabt.imec.be/observer/rawdata/latest';
        this.sg = 'https://opentrafficlights.org/id/signalgroup/K648/1';
        this.SPEED = 0;
        this.first = true;
        this.signalgroups = [];
        this.prevGatGreen = [];
        this.lastGat = null;
        this.iLastGat = null;
        this.nextLastGat = null;
        this.AMOUNT_OF_FRAGMENTS = 15;

        this.vertreklanen = {};
        this.data = {};

        this.lanes = {};    // hash to translate id to description

        this.state = {
            laneValues: {}, //contains the
        };

    }

    async getSignalgroups(_store) {
        let signalgroups = [];
        await _store.getQuads(null, namedNode('http://www.w3.org/2000/01/rdf-schema#type'), namedNode('https://w3id.org/opentrafficlights#Signalgroup')).forEach( (quad) => {
            signalgroups.push(quad.subject.value);
        });
        return signalgroups;
    }

    download(_url) {
        return new Promise(resolve => {
            fetch(_url)
                .then(function(response) {
                    return response.text();
                })
                .then(function(text) {
                    resolve(text);
                });
        });
    }

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


    analise(_store){
        _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#minEndTime'), null).forEach((node) => {
            console.log(node);
        });

    }

    async start() {
        console.log("async funtion start");
        let doc = await this.download(this.DATASET_URL);
        let store = await this.parseAndStoreQuads(doc);
        this.signalgroups = await this.getSignalgroups(store);
        // Init
        this.signalgroups.forEach((sg) => {
            this.prevGatGreen[sg] = null;
            this.data[sg] = [];
        });

        this.analise(store);

    }

    componentDidMount(){
        console.log("componentDidMount");
        this.start();
    }

    render() {
        return (
            <div className="Drawer">
                <p>prediction</p>
            </div>
        );
    }
}

export default Prediction;

