import React, { Component } from 'react';
import n3 from 'n3';
import { Table } from "semantic-ui-react";


const { DataFactory } = n3;
const { namedNode, literal, defaultGraph, quad } = DataFactory;

class Drawer extends Component {

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
            minEndTimes: {},
            maxEndTimes: {},
        };

    }

    sleep(milliseconds){
        return new Promise(resolve => setTimeout(resolve, milliseconds))
    }

    initConfiguration(_store){
        console.log("initConfiguration");
        let laneValues = {};
        let minEndTimes = {};
        let maxEndTimes = {};
        _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#departureLane'), null).forEach((quad) => {
            _store.getQuads(quad.object, namedNode('http://purl.org/dc/terms/description'), null).forEach( (quad) => {
                _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#departureLane'), quad.subject).forEach((connectie) => {
                    let signalgroup = _store.getQuads(connectie.subject, namedNode('https://w3id.org/opentrafficlights#signalGroup'), null)[0].object.value;        //why 0 ?
                    console.log("signalGroup");
                    let test = _store.getQuads(connectie.subject, namedNode('https://w3id.org/opentrafficlights#signalGroup'), null)[0].object.value;
                    console.log(test);
                    _store.getQuads(connectie.subject, namedNode('https://w3id.org/opentrafficlights#arrivalLane'), null).forEach( (arrivalLane) => {
                        _store.getQuads(arrivalLane.object, namedNode('http://purl.org/dc/terms/description'), null).forEach( (descr) => {
                            if(!this.vertreklanen[quad.subject.value]) this.vertreklanen[quad.subject.value] = [];
                            this.vertreklanen[quad.subject.value][arrivalLane.object.value] = {
                                '@id': arrivalLane.object.value,
                                'http://purl.org/dc/terms/description': descr.object.value,
                                'https://w3id.org/opentrafficlights#signalGroup': signalgroup       // why?
                            };
                            if(!laneValues[quad.subject.value]) laneValues[quad.subject.value] = {};
                            if(!minEndTimes[quad.subject.value]) minEndTimes[quad.subject.value] = {};
                            laneValues[quad.subject.value][arrivalLane.object.value] = ["initial","initial"];
                            minEndTimes[quad.subject.value][arrivalLane.object.value] = 0;
                            maxEndTimes[quad.subject.value][arrivalLane.object.value] = 0;
                            if(!this.lanes[arrivalLane.object.value]){
                                this.lanes[arrivalLane.object.value] = descr.object.value;
                            }
                        });
                    });

                    if(!this.lanes[quad.subject.value]){
                        this.lanes[quad.subject.value] = quad.object.value;
                    }

                });
            });
        });
        //console.log(laneValues);
        this.setState({lanes: this.vertreklanen, laneValues: laneValues, minEndTimes: minEndTimes, maxEndTimes: maxEndTimes});
        //console.log(this.vertreklanen);
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

    async calcHistoricData(_store) {
        // Loop over observations order descending
        let observations = _store.getQuads(null, namedNode('http://www.w3.org/ns/prov#generatedAtTime'), null);
        observations.sort(function(a, b) {
            a = new Date(a.object.value).getTime();
            b = new Date(b.object.value).getTime();

            return a>b ? -1 : a<b ? 1 : 0;
        }).forEach((observation) => {
            let generatedAtTime = new Date(observation.object.value);

            if(generatedAtTime !== this.lastGat){
                //console.log(new Date() - generatedAtTime);
                //console.log(generatedAtTime);
                this.lastGat = generatedAtTime;
            }

            // Loop over all signalstates in the observation
            _store.getQuads(null, namedNode('https://w3id.org/opentrafficlights#signalState'), null, observation.subject).forEach((signalstateQuad) => {
                let signalgroup = signalstateQuad.subject.value;
                let signalphase = _store.getQuads(signalstateQuad.object, namedNode('https://w3id.org/opentrafficlights#signalPhase'), null, observation.subject)[0];
                let timeTillGreen;
                // When green
                if (signalphase.object.value === 'https://w3id.org/opentrafficlights/thesauri/signalphase/6') {
                    this.prevGatGreen[signalgroup] = generatedAtTime;
                    timeTillGreen = 0;
                }

                if (this.prevGatGreen[signalgroup] != null){ //does not work with !==
                    timeTillGreen = (this.prevGatGreen[signalgroup].getTime() - generatedAtTime.getTime())/1000;

                    // There's probably a data gap when this is very big
                    if (timeTillGreen < 100) {
                        if (!this.data[signalgroup]) this.data[signalgroup] = [];

                        this.data[signalgroup].unshift({
                            'generatedAtTime': new Date(generatedAtTime),
                            'timeTillGreen': timeTillGreen
                        })
                    }
                }
            });
        });
    }

    async start() {
        console.log("async funtion start");
        let doc = await this.download(this.DATASET_URL);
        let store = await this.parseAndStoreQuads(doc);
        this.signalgroups = await this.getSignalgroups(store);
        this.initConfiguration(store);

        // Init
        this.signalgroups.forEach((sg) => {
            this.prevGatGreen[sg] = null;
            this.data[sg] = [];
        });

        while(true) {
            await this.calcHistoricData(store);
            this.showLatest(store);

            let count = 0;

            // HISTORY
            let prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
            while (prev && count < this.AMOUNT_OF_FRAGMENTS) {
                count++;

                doc = await this.download(prev.object.value);
                store = await this.parseAndStoreQuads(doc);

                await this.calcHistoricData(store);

                prev = store.getQuads(null, namedNode('http://www.w3.org/ns/hydra/core#previous'), null)[0];
            }

            doc = await this.download(this.DATASET_URL);
            store = await this.parseAndStoreQuads(doc);

            this.signalgroups.forEach((sg) => {
                this.prevGatGreen[sg] = null;
                this.data[sg] = [];
            });

            await this.sleep(this.SPEED)
        }
    }

    async showLatest(_store) {
        // Loop over observations order descending
        let observations = _store.getQuads(null, namedNode('http://www.w3.org/ns/prov#generatedAtTime'), null);
        //console.log("observations: ");
        //console.log(observations);
        let latest = observations.sort(function(a, b) {
            a = new Date(a.object.value).getTime();
            b = new Date(b.object.value).getTime();

            return a>b ? -1 : a<b ? 1 : 0;
        })[0];

        let generatedAtTime = latest.object.value;
        //console.log("latest: ");
        //console.log(latest);

        let doc = this;
        let laneValues = this.state.laneValues;
        let minEndTimes = this.state.minEndTimes;
        let maxEndTimes = this.state.maxEndTimes;
        Object.keys(this.vertreklanen).forEach(
            function (fromLane) {
                Object.keys(doc.vertreklanen[fromLane]).forEach(
                    function (toLane) {
                        let signal = doc.vertreklanen[fromLane][toLane]['https://w3id.org/opentrafficlights#signalGroup'];
                        // Get state of active signalgroup
                        //console.log(signal);
                        //console.log(this.sg);
                        let signalstate = _store.getQuads(namedNode(signal), namedNode('https://w3id.org/opentrafficlights#signalState'), null, latest.subject)[0];
                        if (signalstate) {
                            let minEndTime = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#minEndTime'), null, latest.subject)[0];
                            let maxEndTime = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#maxEndTime'), null, latest.subject)[0];
                            let signalPhase = _store.getQuads(signalstate.object, namedNode('https://w3id.org/opentrafficlights#signalPhase'), null, latest.subject)[0];

                            let count = Math.round((new Date(minEndTime.object.value).getTime() - new Date(generatedAtTime).getTime())/1000);
                            if (minEndTime.object.value === maxEndTime.object.value) {
                                laneValues[fromLane][toLane] = [count, signalPhase.object.value];
                                //this.showCounterLabel(count, signalPhase.object.value);
                            } else {
                                laneValues[fromLane][toLane] = [">" + count, signalPhase.object.value];
                                //this.showCounterLabel("> " + count, signalPhase.object.value);
                            }
                            minEndTimes[fromLane][toLane] = Math.round((new Date(minEndTime.object.value).getTime() - new Date(generatedAtTime).getTime())/1000);
                            maxEndTimes[fromLane][toLane] = Math.round((new Date(maxEndTime.object.value).getTime() - new Date(generatedAtTime).getTime())/1000);
                        }

                    }
                )

            }
        );

        this.setState({
            laneValues: laneValues,
            minEndTimes: minEndTimes,
            maxEndTimes: maxEndTimes,
        })

    }

    showCounterLabel(counter_, label_) {
        const info = '<h3>' + counter_ + " seconden</h3>";

        // const info = '<h3 style="float: left">' + label_ + '</h3><h1 style="font-size: 100px;">' + counter_ + '</h1></div>';
        if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/2' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/3') {
            // Red

        }
        else if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/5' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/6') {
            // green
        }
        else {
            // orange
        }
        return info;
    }

    componentDidMount(){
        console.log("componentDidMount");
        this.start();
    }

    buildTable(){
        let table = "<Table>";
        this.vertreklanen.forEach(function (fromLane) {
            table += "<Table.Row>";
            table += "<Table.HeaderCell>" + fromLane + "</Table.HeaderCell>";
            this.vertreklanen[fromLane].forEach(function (toLane) {
                table += "<Table.Cell>" + toLane + "</Table.Cell>";
            });
            table += "</Table.Row>";
        });
        table += "</Table>";
        return table;
    }

    render() {
        console.log("render");
        const {laneValues, minEndTimes, maxEndTimes} = this.state;
        //console.log(this.vertreklanen);
        let doc = this;
        return (
            <div className="Drawer">
                <Table>
                    <Table.Header>
                        <Table.Row>
                            <Table.HeaderCell>From Lane:</Table.HeaderCell>
                            <Table.HeaderCell>To Lanes:</Table.HeaderCell>
                        </Table.Row>
                    </Table.Header>
                    <Table.Body>
                        {Object.keys(this.vertreklanen).map(
                            function (fromLane) {
                                // console.log("from: " + fromLane);
                                return (
                                    <Table.Row><Table.Cell>{fromLane}:{doc.lanes[fromLane]}</Table.Cell>{Object.keys(doc.vertreklanen[fromLane]).map(
                                        function (toLane) {
                                            //console.log("to: " + toLane);
                                            //console.log("lanevalues");
                                            //console.log(laneValues);
                                            const label_= laneValues[fromLane][toLane] ? laneValues[fromLane][toLane][1] : "fail";
                                            const count = laneValues[fromLane][toLane] ? laneValues[fromLane][toLane][0] : "fail";
                                            if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/2' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/3') {
                                                // Red
                                                return (<Table.Cell>{toLane}:{doc.lanes[toLane]}<p style={{color: 'red'}}>{count}</p><div><p>minEndTime: {minEndTimes[fromLane][toLane]}</p><p>maxEndTime: {maxEndTimes[fromLane][toLane]}</p></div></Table.Cell>);
                                            }
                                            else if (label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/5' || label_ === 'https://w3id.org/opentrafficlights/thesauri/signalphase/6') {
                                                // green
                                                return (<Table.Cell>{toLane}:{doc.lanes[toLane]}<p style={{color: 'green'}}>{count}</p><div><p>minEndTime: {minEndTimes[fromLane][toLane]}</p><p>maxEndTime: {maxEndTimes[fromLane][toLane]}</p></div></Table.Cell>);
                                            }
                                            else {
                                                // orange
                                                return (<Table.Cell>{toLane}:{doc.lanes[toLane]}<p style={{ color: 'orange'}}>{count}</p><div><p>minEndTime: {minEndTimes[fromLane][toLane]}</p><p>maxEndTime: {maxEndTimes[fromLane][toLane]}</p></div></Table.Cell>);
                                            }
                                        })
                                    }</Table.Row>);
                            }
                        )}
                    </Table.Body>
                </Table>
            </div>
        );
    }
}

export default Drawer;